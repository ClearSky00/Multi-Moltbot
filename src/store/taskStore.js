import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import * as db from '../services/db';
import { resumeTask as resumeTaskIpc } from '../services/openclaw';

/**
 * Task Store — manages the task queue and the live activity feed.
 *
 * The feed is capped at MAX_FEED_ENTRIES to prevent unbounded memory growth.
 * Tasks are fetched from the database; feed messages are ephemeral in-memory state
 * that accumulates from gateway events during the session.
 */
const useTaskStore = create(
  subscribeWithSelector((set, get) => ({
    // ---- State ----
    tasks: [],
    feedMessages: [],
    MAX_FEED_ENTRIES: 300,

    /**
     * conversationMessages — per-task dialogue history.
     * Shape: { [taskId]: Array<{ role: 'orchestrator'|'user', text: string, timestamp: number }> }
     */
    conversationMessages: {},

    /**
     * awaitingReply — tracks which tasks are currently waiting for user input.
     * Shape: { [taskId]: { question: string, timestamp: number } | null }
     */
    awaitingReply: {},

    // ---- Actions ----

    /**
     * Append a message to the activity feed.
     * Automatically trims older entries when exceeding MAX_FEED_ENTRIES.
     */
    addFeedMessage: (msg) => {
      set((state) => {
        const entry = {
          id: msg.id || `feed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: msg.type || 'info',
          agentId: msg.agentId || null,
          agentName: msg.agentName || null,
          content: msg.content || '',
          detail: msg.detail || null,
          timestamp: msg.timestamp || Date.now(),
        };
        const updated = [entry, ...state.feedMessages];
        if (updated.length > state.MAX_FEED_ENTRIES) {
          return { feedMessages: updated.slice(0, state.MAX_FEED_ENTRIES) };
        }
        return { feedMessages: updated };
      });
    },

    /**
     * Clear all feed messages.
     */
    clearFeed: () => {
      set({ feedMessages: [] });
    },

    /**
     * Mark a task as awaiting user input and record the orchestrator's question
     * into the conversation history.
     */
    setAwaitingReply: (taskId, question) => {
      set((state) => {
        const existing = state.conversationMessages[taskId] || [];
        const entry = { role: 'orchestrator', text: question, timestamp: Date.now() };
        return {
          awaitingReply: {
            ...state.awaitingReply,
            [taskId]: { question, timestamp: Date.now() },
          },
          conversationMessages: {
            ...state.conversationMessages,
            [taskId]: [...existing, entry],
          },
        };
      });
    },

    /**
     * Clear the awaiting-input flag for a task (called after user sends a reply
     * or the task resumes/completes).
     */
    clearAwaitingReply: (taskId) => {
      set((state) => {
        const { [taskId]: _removed, ...rest } = state.awaitingReply;
        return { awaitingReply: rest };
      });
    },

    /**
     * Append a message to a task's conversation history.
     * Does not modify awaitingReply — call setAwaitingReply / clearAwaitingReply separately.
     */
    addConversationMessage: (taskId, message) => {
      set((state) => {
        const existing = state.conversationMessages[taskId] || [];
        return {
          conversationMessages: {
            ...state.conversationMessages,
            [taskId]: [
              ...existing,
              {
                role: message.role || 'user',
                text: message.text || '',
                timestamp: message.timestamp || Date.now(),
              },
            ],
          },
        };
      });
    },

    /**
     * Add a task to the local task list. If a task with the same id already
     * exists, merge the new fields into it instead of creating a duplicate.
     */
    addTask: (task) => {
      set((state) => {
        const existing = state.tasks.find((t) => t.id === task.id);
        if (existing) {
          return {
            tasks: state.tasks.map((t) =>
              t.id === task.id
                ? {
                    ...t,
                    goal: task.goal || t.goal,
                    status: task.status || t.status,
                    agentId: task.agentId ?? t.agentId,
                    updatedAt: Date.now(),
                    progress: task.progress ?? t.progress,
                    result: task.result ?? t.result,
                    error: task.error ?? t.error,
                  }
                : t
            ),
          };
        }
        return {
          tasks: [
            {
              id: task.id,
              goal: task.goal || '',
              status: task.status || 'pending',
              agentId: task.agentId || null,
              createdAt: task.createdAt || Date.now(),
              updatedAt: task.updatedAt || Date.now(),
              progress: task.progress || 0,
              result: task.result || null,
              error: task.error || null,
            },
            ...state.tasks,
          ],
        };
      });
    },

    /**
     * Update an existing task by taskId with partial updates.
     */
    updateTask: (taskId, updates) => {
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId
            ? { ...t, ...updates, updatedAt: Date.now() }
            : t
        ),
      }));
    },

    removeTask: (taskId) => {
      const removed = get().tasks.find((t) => t.id === taskId);
      set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== taskId),
      }));
      // Returns a rollback function — call on async failure to restore the task
      return () => {
        if (removed) {
          set((state) => {
            const exists = state.tasks.some((t) => t.id === removed.id);
            if (exists) return state;
            return { tasks: [removed, ...state.tasks] };
          });
        }
      };
    },

    /**
     * Resume a quota_exhausted task. Optimistically sets status to 'running',
     * then calls the IPC resume handler.
     */
    resumeTask: async (taskId) => {
      get().updateTask(taskId, { status: 'running', error: null });
      try {
        const result = await resumeTaskIpc(taskId);
        if (result?.error) {
          get().updateTask(taskId, { status: 'quota_exhausted' });
          return { error: result.error };
        }
        return { taskId };
      } catch (err) {
        get().updateTask(taskId, { status: 'quota_exhausted' });
        return { error: err?.message || 'Resume failed' };
      }
    },

    /**
     * Fetch all tasks from the database and merge with in-memory active tasks.
     * Gateway events (task:started / task:progress) update the store before the DB
     * row always reflects "running"; a plain replace would hide ongoing work on the Tasks screen.
     */
    fetchTasks: async () => {
      try {
        const prevTasks = get().tasks;
        const localActive = prevTasks.filter(
          (t) => t?.id && (
            t.status === 'running' ||
            t.status === 'pending' ||
            t.status === 'quota_exhausted'
          )
        );

        const result = await db.listTasks();
        if (result?.error) {
          console.error('[TaskStore] fetchTasks DB error:', result.error);
          return;
        }
        const raw = result?.data;
        const taskList = Array.isArray(raw) ? raw : [];

        const toRow = (t) => ({
          id: t.id,
          goal: t.goal || '',
          status: t.status || 'pending',
          agentId: t.agentId || null,
          assigned_agents: t.assigned_agents,
          createdAt: t.createdAt || t.created_at || Date.now(),
          updatedAt: t.updatedAt || t.updated_at || Date.now(),
          completedAt: t.completedAt || t.completed_at || null,
          progress: t.progress || 0,
          result: t.result || null,
          error: t.error || null,
        });

        const terminal = new Set(['completed', 'failed', 'cancelled']);
        const dbRows = taskList.map(toRow);
        const byId = new Map(dbRows.map((r) => [String(r.id), { ...r }]));

        for (const local of localActive) {
          const key = String(local.id);
          const existing = byId.get(key);
          if (existing && terminal.has(existing.status)) {
            continue;
          }
          if (!existing) {
            byId.set(key, {
              id: local.id,
              goal: local.goal || '',
              status: local.status || 'pending',
              agentId: local.agentId || null,
              assigned_agents: local.assigned_agents,
              createdAt: local.createdAt || Date.now(),
              updatedAt: local.updatedAt || Date.now(),
              completedAt: local.completedAt || null,
              progress: local.progress || 0,
              result: local.result || null,
              error: local.error || null,
            });
          } else {
            existing.progress = Math.max(existing.progress || 0, local.progress || 0);
            if (local.status === 'running' && existing.status === 'pending') {
              existing.status = 'running';
            }
            if (local.goal && !existing.goal) {
              existing.goal = local.goal;
            }
          }
        }

        const merged = Array.from(byId.values());
        merged.sort((a, b) => {
          const aTime = new Date(a.createdAt || 0).getTime();
          const bTime = new Date(b.createdAt || 0).getTime();
          return bTime - aTime;
        });

        set({ tasks: merged });
      } catch (err) {
        console.error('[TaskStore] fetchTasks failed:', err);
      }
    },
  }))
);

export { useTaskStore };
export default useTaskStore;

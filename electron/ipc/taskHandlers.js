'use strict';

const { ipcMain } = require('electron');
const { v4: uuidv4 } = require('uuid');
const gatewayBridge = require('./gatewayBridge');
const { getSupabase, safeInsert } = require('../services/supabase');
const requireAuth = require('./requireAuth');
const orchestrator = require('../services/orchestrator');

// =============================================================================
// IPC Handlers
// =============================================================================

/**
 * Register all task:* IPC handlers.
 * Tasks flow through the orchestrator for multi-agent execution and are
 * persisted in Supabase along with their associated builds.
 * @param {Electron.BrowserWindow} mainWindow
 */
module.exports = function registerTaskHandlers(mainWindow) {
  // ---------------------------------------------------------------------------
  // task:submit-goal — The primary action: send a high-level goal.
  // Creates a task record in Supabase, then kicks off the build orchestrator
  // pipeline in the background. Returns the taskId immediately.
  // ---------------------------------------------------------------------------
  ipcMain.handle('task:submit-goal', async (_event, { goal, metadata }) => {
    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const taskId = uuidv4();
    const now = new Date().toISOString();

    const supabase = getSupabase();
    if (supabase) {
      const { error: taskError } = await safeInsert(supabase, 'tasks', {
        id: taskId,
        goal,
        status: 'pending',
        user_id: auth.userId,
        created_at: now,
      });

      if (taskError) {
        console.error('[taskHandlers] Failed to persist task:', taskError.message);
      }

      const { error: auditError } = await safeInsert(supabase, 'audit_log', {
        event_type: 'goal_submitted',
        task_id: taskId,
        user_id: auth.userId,
        payload: {
          goal,
          metadata: metadata || {},
        },
        created_at: now,
      });

      if (auditError) {
        console.error('[taskHandlers] Failed to write audit log:', auditError.message);
      }
    }

    if (!gatewayBridge.isConnected) {
      if (supabase) {
        await supabase.from('tasks').update({
          status: 'failed',
          result: 'Gateway not connected',
        }).eq('id', taskId);
      }
      return { error: 'Gateway not connected', taskId };
    }

    orchestrator.execute({
      taskId,
      goal,
      metadata,
      mainWindow,
      userId: auth.userId,
    }).catch((err) => {
      console.error('[taskHandlers] orchestrator.execute failed:', err.message);
    });

    return { data: { taskId } };
  });

  // ---------------------------------------------------------------------------
  // task:cancel — Cancel a running task via the Gateway and update Supabase.
  // ---------------------------------------------------------------------------
  ipcMain.handle('task:cancel', async (_event, { taskId }) => {
    const id =
      typeof taskId === 'string' ? taskId.trim() : String(taskId ?? '').trim();
    if (!id) return { error: 'taskId is required' };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not configured' };

    const { data: row, error: fetchErr } = await supabase
      .from('tasks')
      .select('status')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) return { error: fetchErr.message };

    if (!row) {
      const now = new Date().toISOString();
      if (gatewayBridge.isConnected) {
        const runId = gatewayBridge.getRunIdForTask(id);
        if (runId) {
          gatewayBridge.request('chat.abort', { runId }).catch((err) => {
            console.error('[taskHandlers] Gateway abort failed:', err.message);
          });
          gatewayBridge._clearRunMapping(runId, id);
        }
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('task:cancelled', {
          taskId: id,
          reason: 'Cancelled by user',
          cancelledAt: now,
        });
      }
      return { data: { cancelled: true, taskId: id, dbSkipped: true } };
    }

    if (!['pending', 'running', 'awaiting_input', 'awaiting_approval'].includes(row.status)) {
      return { error: 'Only pending, running, or awaiting tasks can be cancelled' };
    }

    const now = new Date().toISOString();

    const { data: updatedRows, error: taskError } = await supabase
      .from('tasks')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select('id');

    if (taskError) return { error: taskError.message };
    if (!updatedRows || updatedRows.length === 0) {
      return {
        error:
          'Task could not be updated. It may belong to another account or was already completed.',
      };
    }

    // Cancel associated build if active
    const activeBuild = orchestrator.getActiveBuildForTask(id);
    if (activeBuild) {
      await supabase.from('builds').update({
        status: 'cancelled',
        completed_at: now,
      }).eq('id', activeBuild.id);
    }

    const { error: auditError } = await safeInsert(supabase, 'audit_log', {
      event_type: 'task_cancelled',
      task_id: id,
      user_id: auth.userId,
      payload: { reason: 'Cancelled by user' },
      created_at: now,
    });
    if (auditError) {
      console.error('[taskHandlers] audit_log insert failed:', auditError.message);
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('task:cancelled', {
        taskId: id,
        reason: 'Cancelled by user',
        cancelledAt: now,
      });
    }

    if (gatewayBridge.isConnected) {
      const runId = gatewayBridge.getRunIdForTask(id);
      if (runId) {
        gatewayBridge.request('chat.abort', { runId }).catch((err) => {
          console.error('[taskHandlers] Gateway abort failed:', err.message);
        });
        gatewayBridge._clearRunMapping(runId, id);
      }
    }

    return { data: { cancelled: true, taskId: id } };
  });

  // ---------------------------------------------------------------------------
  // task:resume — Resume a quota_exhausted task from its saved checkpoint.
  // ---------------------------------------------------------------------------
  ipcMain.handle('task:resume', async (_event, { taskId }) => {
    if (!taskId) return { error: 'taskId is required' };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not configured' };

    const { data: task, error: fetchErr } = await supabase
      .from('tasks')
      .select('status')
      .eq('id', taskId)
      .maybeSingle();

    if (fetchErr) return { error: fetchErr.message };
    if (!task) return { error: 'Task not found' };
    if (task.status !== 'quota_exhausted') {
      return { error: 'Task is not in quota_exhausted state' };
    }

    if (!gatewayBridge.isConnected) {
      return { error: 'Gateway not connected' };
    }

    orchestrator.resume({
      taskId,
      mainWindow,
      userId: auth.userId,
    }).catch((err) => {
      console.error('[taskHandlers] orchestrator.resume failed:', err.message);
    });

    return { data: { taskId, resumed: true } };
  });

  // ---------------------------------------------------------------------------
  // task:list — List tasks from Supabase, ordered newest first.
  // ---------------------------------------------------------------------------
  ipcMain.handle('task:list', async (_event, { limit, status } = {}) => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not configured' };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    let query = supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }
    if (typeof limit === 'number' && limit > 0) {
      query = query.limit(limit);
    } else {
      query = query.limit(100);
    }

    const { data, error } = await query;
    if (error) return { error: error.message };
    return { data };
  });

  // ---------------------------------------------------------------------------
  // task:get — Retrieve a single task by ID.
  // ---------------------------------------------------------------------------
  ipcMain.handle('task:get', async (_event, { taskId }) => {
    if (!taskId) return { error: 'taskId is required' };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not configured' };

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (error) return { error: error.message };
    return { data };
  });

  // ---------------------------------------------------------------------------
  // task:respond — Answer a clarifying question on an awaiting_input task.
  // Resumes the orchestration pipeline with the original goal + answer.
  // ---------------------------------------------------------------------------
  ipcMain.handle('task:respond', async (_event, { taskId, answer }) => {
    if (!taskId) return { error: 'taskId is required' };
    if (!answer || typeof answer !== 'string' || !answer.trim()) {
      return { error: 'answer is required' };
    }

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not configured' };

    const { data: task, error: fetchErr } = await supabase
      .from('tasks')
      .select('status, goal, result')
      .eq('id', taskId)
      .maybeSingle();

    if (fetchErr) return { error: fetchErr.message };
    if (!task) return { error: 'Task not found' };
    if (!['awaiting_input', 'awaiting_approval'].includes(task.status)) {
      return { error: 'Task is not awaiting input or approval' };
    }

    if (!gatewayBridge.isConnected) {
      return { error: 'Gateway not connected' };
    }

    const combinedGoal =
      `Original goal: ${task.goal}\n` +
      `You asked: ${task.result}\n` +
      `User answered: ${answer.trim()}`;

    await safeInsert(supabase, 'audit_log', {
      event_type: 'task_clarify_answered',
      task_id: taskId,
      user_id: auth.userId,
      payload: { question: task.result, answer: answer.trim() },
      created_at: new Date().toISOString(),
    });

    orchestrator.execute({
      taskId,
      goal: combinedGoal,
      metadata: {},
      mainWindow,
      userId: auth.userId,
    }).catch((err) => {
      console.error('[taskHandlers] orchestrator.execute (respond) failed:', err.message);
    });

    return { data: { taskId, resumed: true } };
  });

  // ---------------------------------------------------------------------------
  // task:message-agent — Send a direct message to a running agent's session.
  // Tries chat.send first (works across all gateway versions), falls back to
  // sessions_send if chat.send is unsupported.
  // ---------------------------------------------------------------------------
  ipcMain.handle('task:message-agent', async (_event, { agentId, message }) => {
    if (!agentId) return { error: 'agentId is required' };
    if (!message || typeof message !== 'string' || !message.trim()) {
      return { error: 'message is required' };
    }

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    if (!gatewayBridge.isConnected) {
      return { error: 'Gateway not connected — start OpenClaw first' };
    }

    const trimmed = message.trim();

    try {
      // Try chat.send first — compatible with all gateway versions
      const { v4: uuidv4 } = require('uuid');
      const chatResult = await gatewayBridge.request('chat.send', {
        sessionKey: agentId,
        message: trimmed,
        idempotencyKey: uuidv4(),
      }, 15_000);

      // If chat.send returns a runId, wait for the response
      if (chatResult?.runId) {
        const completion = await gatewayBridge.waitForRunCompletion(
          chatResult.runId,
          60_000,
        );
        return { data: { result: completion.result } };
      }

      return { data: chatResult };
    } catch (_chatErr) {
      // Fallback to sessions_send if chat.send fails
      try {
        const result = await gatewayBridge.request('sessions_send', {
          sessionKey: agentId,
          message: trimmed,
          timeoutSeconds: 60,
        });
        return { data: result };
      } catch (fallbackErr) {
        return { error: fallbackErr.message || 'Failed to message agent' };
      }
    }
  });

  // ---------------------------------------------------------------------------
  // task:approve — User explicitly marks an awaiting_approval task as done.
  // Updates Supabase and sends task:completed to the renderer.
  // ---------------------------------------------------------------------------
  ipcMain.handle('task:approve', async (_event, { taskId }) => {
    if (!taskId) return { error: 'taskId is required' };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not configured' };

    const { data: task, error: fetchErr } = await supabase
      .from('tasks')
      .select('status, result')
      .eq('id', taskId)
      .maybeSingle();

    if (fetchErr) return { error: fetchErr.message };
    if (!task) return { error: 'Task not found' };
    if (task.status !== 'awaiting_approval') {
      return { error: 'Task is not awaiting approval' };
    }

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('tasks')
      .update({ status: 'completed', completed_at: now })
      .eq('id', taskId);

    if (updateError) return { error: updateError.message };

    await safeInsert(supabase, 'audit_log', {
      event_type: 'task_completed',
      task_id: taskId,
      user_id: auth.userId,
      payload: {
        result_preview: task.result?.slice(0, 500) || null,
        approved_by_user: true,
      },
      created_at: now,
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('task:completed', {
        taskId,
        result: task.result,
        completedAt: now,
      });
    }

    return { data: { taskId, approved: true } };
  });
};

import React, { createContext, useEffect, useState, useCallback, useRef } from 'react';
import useAgentStore from '../store/agentStore';
import useTaskStore from '../store/taskStore';
import useToastStore from '../store/toastStore';
import { getGatewayStatus, connectGateway, getSettings } from '../services/openclaw';

/**
 * GatewayContext — React context that subscribes to all gateway and agent
 * events forwarded from the main process via window.hivemind.on().
 *
 * Responsibilities:
 *   - Listen to gateway:event, gateway:connected, gateway:disconnected, gateway:error
 *   - Listen to security:checkpoint, agent:status-changed, agent:message-received
 *   - Listen to task:started, task:progress, task:completed, task:cancelled, task:failed
 *   - Update agentStore and taskStore in response to events
 *   - Provide { status, error } to consumers
 *   - Clean up all listeners on unmount
 */

export const GatewayContext = createContext({
  status: 'disconnected',
  error: null,
  reconnectGateway: async () => {},
});

export function GatewayProvider({ children }) {
  const [status, setStatus] = useState('disconnected');
  const [error, setError] = useState(null);
  const cleanupsRef = useRef([]);

  const addCleanup = useCallback((fn) => {
    if (typeof fn === 'function') {
      cleanupsRef.current.push(fn);
    }
  }, []);

  const reconnectGateway = useCallback(async () => {
    if (!window.hivemind?.invoke) return;
    try {
      setError(null);
      const res = await getSettings();
      const data = res?.data ?? res ?? {};
      const url =
        (typeof data.gateway_url === 'string' && data.gateway_url.trim()) ||
        (typeof data.gatewayUrl === 'string' && data.gatewayUrl.trim()) ||
        '';
      await connectGateway(url || undefined);
      setStatus('connected');
      setError(null);
    } catch (e) {
      setStatus('error');
      setError(e?.message || 'Reconnect failed');
    }
  }, []);

  // Sync UI if the main process connected before listeners were registered
  useEffect(() => {
    if (!window.hivemind?.invoke) return undefined;
    let cancelled = false;
    getGatewayStatus()
      .then((st) => {
        if (cancelled) return;
        if (st?.connected) {
          setStatus('connected');
          setError(null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Bail out if the bridge is not available (e.g., running outside Electron)
    if (!window.hivemind?.on) return;

    // --- gateway:connected ---
    addCleanup(
      window.hivemind.on('gateway:connected', (data) => {
        setStatus('connected');
        setError(null);
        useTaskStore.getState().addFeedMessage({
          type: 'system',
          content: 'Gateway connected',
          detail: data?.url || null,
        });
      })
    );

    // --- gateway:disconnected ---
    addCleanup(
      window.hivemind.on('gateway:disconnected', () => {
        setStatus('disconnected');
        useTaskStore.getState().addFeedMessage({
          type: 'system',
          content: 'Gateway disconnected',
        });
        useToastStore.getState().addToast({
          type: 'warning',
          title: 'Gateway disconnected',
          message: 'Click the status indicator in the sidebar to reconnect.',
          duration: 6000,
        });
      })
    );

    // --- gateway:error ---
    addCleanup(
      window.hivemind.on('gateway:error', (data) => {
        setStatus('error');
        setError(data?.message || 'Unknown gateway error');
        useTaskStore.getState().addFeedMessage({
          type: 'error',
          content: `Gateway error: ${data?.message || 'Unknown'}`,
        });
        useToastStore.getState().addToast({
          type: 'error',
          title: 'Gateway error',
          message: data?.message || 'Unknown gateway error',
          duration: 7000,
        });
      })
    );

    // --- gateway:event (the main event bus from OpenClaw) ---
    addCleanup(
      window.hivemind.on('gateway:event', (frame) => {
        if (!frame) return;

        const { event, payload } = frame;
        if (!payload) return;

        if (event === 'agent') {
          // Normalize: status may be nested in content or flat
          const agentStatus = payload.content?.status || payload.status;
          const agentAction = payload.content?.currentAction || payload.currentAction;

          // Update agent status in the store
          if (payload.agentId && agentStatus) {
            useAgentStore
              .getState()
              .updateAgentStatus(payload.agentId, agentStatus, agentAction || null);
          }

          // Determine feed content from nested or flat structure
          const feedContent =
            payload.content?.text || payload.content?.currentAction ||
            payload.text || payload.message || payload.action ||
            agentAction || '';

          // Add to activity feed
          if (feedContent) {
            useTaskStore.getState().addFeedMessage({
              type: payload.type === 'security_checkpoint' ? 'security' : 'agent',
              agentId: payload.agentId,
              agentName: payload.agentName || payload.agentId,
              content: feedContent,
              detail: payload.detail || payload.riskLevel || null,
              timestamp: payload.timestamp,
            });
          }
        }

        if (event === 'health') {
          useTaskStore.getState().addFeedMessage({
            type: 'system',
            content: `Health: ${payload.status || 'ok'}`,
            detail: payload.detail || null,
          });
        }

        if (event === 'heartbeat') {
          useTaskStore.getState().addFeedMessage({
            type: 'system',
            agentId: payload.agentId,
            content: 'Heartbeat received',
          });
        }
      })
    );

    // --- security:checkpoint ---
    addCleanup(
      window.hivemind.on('security:checkpoint', (data) => {
        useAgentStore.getState().triggerCheckpoint(data);
        useTaskStore.getState().addFeedMessage({
          type: 'security',
          agentId: data?.agentId,
          content: `Security checkpoint: ${data?.description || data?.action || 'Approval required'}`,
          detail: data?.risk || null,
        });
      })
    );

    // --- agent:status-changed ---
    addCleanup(
      window.hivemind.on('agent:status-changed', (data) => {
        if (data?.agentId && data?.status) {
          useAgentStore
            .getState()
            .updateAgentStatus(data.agentId, data.status, data.currentAction || null);
        }
      })
    );

    // --- agent:message-received ---
    addCleanup(
      window.hivemind.on('agent:message-received', (data) => {
        if (data) {
          useTaskStore.getState().addFeedMessage({
            type: 'agent',
            agentId: data.agentId,
            agentName: data.agentName || data.agentId,
            content: data.text || data.message || '',
            detail: data.detail || null,
            timestamp: data.timestamp,
          });
        }
      })
    );

    // --- task:started ---
    addCleanup(
      window.hivemind.on('task:started', (data) => {
        if (data) {
          useTaskStore.getState().addTask({
            id: data.taskId || data.id,
            goal: data.goal || '',
            status: 'running',
            agentId: data.agentId || null,
          });
          useTaskStore.getState().addFeedMessage({
            type: 'task',
            content: `Task started: ${data.goal || data.taskId || 'Unknown'}`,
            agentId: data.agentId,
          });
        }
      })
    );

    // --- task:progress ---
    addCleanup(
      window.hivemind.on('task:progress', (data) => {
        if (data?.taskId) {
          useTaskStore.getState().updateTask(data.taskId, {
            progress: data.progress || 0,
            status: 'running',
          });
        }
      })
    );

    // --- task:completed ---
    addCleanup(
      window.hivemind.on('task:completed', (data) => {
        if (data?.taskId) {
          useTaskStore.getState().updateTask(data.taskId, {
            status: 'completed',
            result: data.result || null,
            progress: 100,
          });
          useTaskStore.getState().clearAwaitingReply(data.taskId);
          useAgentStore.getState().endActiveTaskSession(data.taskId);
          if (useAgentStore.getState().awaitingInputTaskId === data.taskId) {
            useAgentStore.getState().setAwaitingInputTask(null);
          }
          if (useAgentStore.getState().awaitingApprovalTask?.taskId === data.taskId) {
            useAgentStore.getState().setAwaitingApprovalTask(null);
          }
          useAgentStore.getState().updateAgentStatus(
            data.agentId,
            'idle',
            null
          );
          useTaskStore.getState().addFeedMessage({
            type: 'task',
            content: `Task completed: ${data.goal || data.taskId || 'Unknown'}`,
            agentId: data.agentId,
          });
        }
      })
    );

    // --- task:cancelled (user cancel / stop from UI or IPC) ---
    addCleanup(
      window.hivemind.on('task:cancelled', (data) => {
        if (data?.taskId) {
          useTaskStore.getState().updateTask(data.taskId, {
            status: 'cancelled',
            error: null,
            completedAt: data.cancelledAt || Date.now(),
          });
          useTaskStore.getState().clearAwaitingReply(data.taskId);
          if (useAgentStore.getState().awaitingInputTaskId === data.taskId) {
            useAgentStore.getState().setAwaitingInputTask(null);
          }
          useAgentStore.getState().endActiveTaskSession(data.taskId);
          useTaskStore.getState().addFeedMessage({
            type: 'system',
            content: `Task cancelled: ${data.taskId}`,
          });
        }
      })
    );

    // --- task:awaiting-approval — orchestrator finished; user decides when done ---
    addCleanup(
      window.hivemind.on('task:awaiting-approval', (data) => {
        if (!data?.taskId) return;
        useTaskStore.getState().updateTask(data.taskId, {
          status: 'awaiting_approval',
          result: data.result || null,
        });
        // Clear any open clarification dialogue for this task — the pipeline
        // has moved past the clarify phase and is now awaiting user sign-off.
        if (useAgentStore.getState().awaitingInputTaskId === data.taskId) {
          useAgentStore.getState().setAwaitingInputTask(null);
        }
        useAgentStore.getState().setAwaitingApprovalTask({
          taskId: data.taskId,
          result: data.result || '',
        });
        useTaskStore.getState().addFeedMessage({
          type: 'task',
          agentId: 'orchestrator',
          agentName: 'Orchestrator',
          content: 'Task ready for review — waiting for your approval.',
        });
      })
    );

    // --- task:awaiting-input — orchestrator needs clarification from the user ---
    addCleanup(
      window.hivemind.on('task:awaiting-input', (data) => {
        if (!data?.taskId) return;
        useTaskStore.getState().updateTask(data.taskId, { status: 'awaiting_input' });
        useTaskStore.getState().setAwaitingReply(data.taskId, data.question || '');
        useAgentStore.getState().setAwaitingInputTask(data.taskId);
        useTaskStore.getState().addFeedMessage({
          type: 'system',
          agentId: 'orchestrator',
          agentName: 'Orchestrator',
          content: `Clarification needed: ${data.question || '(question missing)'}`,
        });
      })
    );

    // --- task:failed ---
    addCleanup(
      window.hivemind.on('task:failed', (data) => {
        if (data?.taskId) {
          useTaskStore.getState().updateTask(data.taskId, {
            status: 'failed',
            error: data.error || data.reason || 'Unknown error',
          });
          useTaskStore.getState().clearAwaitingReply(data.taskId);
          if (useAgentStore.getState().awaitingInputTaskId === data.taskId) {
            useAgentStore.getState().setAwaitingInputTask(null);
          }
          useAgentStore.getState().clearDashboardRunFlagsIfActiveTask(data.taskId);
          if (data.agentId) {
            useAgentStore.getState().updateAgentStatus(data.agentId, 'error', null);
          }
          useTaskStore.getState().addFeedMessage({
            type: 'error',
            content: `Task failed: ${data.error || data.reason || data.taskId || 'Unknown'}`,
            agentId: data.agentId,
          });
        }
      })
    );

    // --- task:quota-exhausted ---
    addCleanup(
      window.hivemind.on('task:quota-exhausted', (data) => {
        if (!data?.taskId) return;
        useTaskStore.getState().updateTask(data.taskId, {
          status: 'quota_exhausted',
          error: data.message || 'API quota exhausted',
        });
        useAgentStore.getState().clearDashboardRunFlagsIfActiveTask(data.taskId);
        const provider = data.provider || 'API provider';
        useToastStore.getState().addToast({
          type: 'warning',
          title: 'API Credits Exhausted',
          message: `${provider} quota reached. Task paused — add credits, then resume.`,
          persistent: true,
          action: {
            label: 'Open Settings',
            onClick: () => {
              window.location.hash = '#/settings';
            },
          },
        });
        useTaskStore.getState().addFeedMessage({
          type: 'error',
          content: `Quota exhausted (${provider}): task ${data.taskId} paused`,
        });
      })
    );

    // Cleanup all listeners on unmount
    return () => {
      for (const cleanup of cleanupsRef.current) {
        cleanup();
      }
      cleanupsRef.current = [];
    };
  }, [addCleanup]);

  return (
    <GatewayContext.Provider value={{ status, error, reconnectGateway }}>
      {children}
    </GatewayContext.Provider>
  );
}

export default GatewayContext;

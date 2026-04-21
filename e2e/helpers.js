/**
 * Inject a mock window.hivemind bridge into the page before the app loads.
 * This simulates the Electron preload environment for browser-based E2E testing.
 */
export async function injectHivemindMock(page) {
  await page.addInitScript(() => {
    const listeners = {};

    window.hivemind = {
      platform: 'win32',
      version: '0.1.0',

      invoke: async (channel, data) => {
        // Return sensible defaults for each channel
        switch (channel) {
          case 'db:agents:list':
            return {
              data: [
                { id: 'orchestrator', name: 'Orchestrator', role: 'CEO & task router', model: 'gemini-1.5-pro', status: 'idle', is_preset: true, sandbox_mode: 'all', tools_allow: [], tools_deny: [] },
                { id: 'pm', name: 'PM', role: 'Planning', model: 'gemini-2.0-flash', status: 'idle', is_preset: true, sandbox_mode: 'all', tools_allow: [], tools_deny: [] },
                { id: 'coder', name: 'Coder', role: 'Engineering', model: 'gemini-2.0-flash', status: 'idle', is_preset: true, sandbox_mode: 'all', tools_allow: ['write_file', 'exec'], tools_deny: [] },
                { id: 'qa', name: 'QA', role: 'Testing', model: 'gemini-2.0-flash', status: 'idle', is_preset: true, sandbox_mode: 'all', tools_allow: [], tools_deny: [] },
                { id: 'cybersec', name: 'CyberSec', role: 'Security audit', model: 'gemini-2.0-flash', status: 'idle', is_preset: true, sandbox_mode: 'all', tools_allow: [], tools_deny: [] },
                { id: 'design', name: 'Design', role: 'UI/UX', model: 'gemini-2.0-flash', status: 'idle', is_preset: true, sandbox_mode: 'all', tools_allow: [], tools_deny: [] },
                { id: 'marketing', name: 'Marketing', role: 'Copywriting', model: 'gemini-2.0-flash', status: 'idle', is_preset: true, sandbox_mode: 'all', tools_allow: [], tools_deny: [] },
                { id: 'research', name: 'Research', role: 'Intelligence', model: 'gemini-2.0-flash', status: 'idle', is_preset: true, sandbox_mode: 'all', tools_allow: [], tools_deny: [] },
                { id: 'patrol', name: 'Patrol', role: 'Watchdog', model: 'gemini-2.0-flash', status: 'idle', is_preset: true, sandbox_mode: 'all', tools_allow: [], tools_deny: [] },
              ]
            };
          case 'db:tasks:list':
            return { data: [] };
          case 'db:audit:list':
            return { data: [] };
          case 'db:skills:list':
            return { data: [] };
          case 'db:settings:get':
            return { data: null };
          case 'db:settings:set':
            return { data: { saved: true } };
          case 'agent:list':
            return { data: [] };
          case 'gateway:status':
            return { connected: false, pendingRequests: 0 };
          case 'settings:get':
            return { data: { gatewayUrl: 'ws://127.0.0.1:18789' } };
          case 'settings:save':
            return { data: { saved: true } };
          case 'settings:save-api-key':
            return { data: { saved: true } };
          case 'settings:get-api-key':
            return { data: { key: null } };
          case 'settings:delete-api-key':
            return { data: { deleted: true } };
          case 'system:detect-gateway':
            return { data: { detected: false, url: 'ws://127.0.0.1:18789' } };
          case 'system:openclaw-status':
            return { data: { running: false } };
          case 'system:get-openclaw-version':
            return { data: { version: null, installed: false } };
          case 'window:minimize':
          case 'window:maximize':
          case 'window:close':
            return { ok: true };
          case 'window:is-maximized':
            return { maximized: false };
          case 'task:submit-goal':
            return { data: { taskId: 'mock-task-1' } };
          case 'task:list':
            return { data: [] };
          case 'skill:list-global':
          case 'skill:list-agent':
            return { data: [] };
          case 'file:read-soul':
          case 'file:read-agents':
          case 'file:read-memory':
          case 'file:read-heartbeat':
            return { data: { content: null, exists: false } };
          case 'file:read-daily-logs':
            return { data: { logs: [], availableDates: [] } };
          case 'file:read-sessions':
            return { data: [] };
          default:
            console.warn('[Mock] Unhandled IPC channel:', channel);
            return { data: null };
        }
      },

      on: (channel, callback) => {
        if (!listeners[channel]) listeners[channel] = [];
        listeners[channel].push(callback);
        return () => {
          listeners[channel] = listeners[channel].filter(cb => cb !== callback);
        };
      },

      once: (channel, callback) => {
        const wrapper = (...args) => {
          callback(...args);
          listeners[channel] = listeners[channel].filter(cb => cb !== wrapper);
        };
        if (!listeners[channel]) listeners[channel] = [];
        listeners[channel].push(wrapper);
      },

      // Test utility to emit events
      _emit: (channel, ...args) => {
        if (listeners[channel]) {
          listeners[channel].forEach(cb => cb(...args));
        }
      },
    };
  });
}

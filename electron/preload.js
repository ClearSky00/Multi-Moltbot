'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// ============================================================================
// STRICT CHANNEL WHITELISTS
// The renderer process can ONLY use channels listed here. Any attempt to
// invoke or listen on an unlisted channel is blocked and logged.
// ============================================================================

const ALLOWED_INVOKE = [
  // Agent management
  'agent:list',
  'agent:get',
  'agent:create',
  'agent:update',
  'agent:delete',
  'agent:start',
  'agent:stop',
  'agent:restart',

  // File system (SOUL.md, AGENTS.md, memory, heartbeat)
  'file:read-soul',
  'file:write-soul',
  'file:read-agents',
  'file:write-agents',
  'file:read-memory',
  'file:read-daily-logs',
  'file:read-heartbeat',
  'file:write-heartbeat',
  'file:read-sessions',
  'file:read-session-log',

  // Gateway (OpenClaw WebSocket bridge)
  'gateway:status',
  'gateway:send',
  'gateway:connect',
  'gateway:disconnect',

  // Goal / task submission
  'task:submit-goal',
  'task:cancel',
  'task:respond',
  'task:resume',
  'task:approve',
  'task:list',
  'task:get',

  // Security checkpoint
  'checkpoint:respond',

  // Skills
  'skill:list-global',
  'skill:list-agent',
  'skill:install',
  'skill:uninstall',
  'skill:enable',
  'skill:disable',
  'skill:search-registry',

  // Settings
  'settings:get',
  'settings:save',
  'settings:save-api-key',
  'settings:get-api-key',
  'settings:delete-api-key',

  // Model providers
  'provider:list',
  'provider:upsert',
  'provider:delete',
  'provider:save-key',
  'provider:delete-key',
  'provider:test',
  'provider:models',

  // OpenClaw config
  'config:read',
  'config:write',
  'config:validate',

  // Window controls
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:is-maximized',

  // System
  'system:open-folder',
  'system:openclaw-status',
  'system:get-openclaw-version',
  'system:detect-gateway',

  // Database — agents
  'db:agents:list',
  'db:agents:get',
  'db:agents:upsert',
  'db:agents:delete',

  // Database — tasks
  'db:tasks:list',
  'db:tasks:create',
  'db:tasks:update',
  'db:tasks:delete',

  // Database — audit
  'db:audit:append',
  'db:audit:list',

  // Database — checkpoints
  'db:checkpoints:create',
  'db:checkpoints:resolve',

  // Database — skills
  'db:skills:list',
  'db:skills:upsert',
  'db:skills:delete',

  // Database — builds
  'db:builds:list',
  'db:builds:get',
  'db:builds:create',
  'db:builds:update',
  'db:builds:delete',

  // Database — settings
  'db:settings:get',
  'db:settings:set',

  // Auth — secure token storage
  'auth:storage:get',
  'auth:storage:set',
  'auth:storage:remove',
  'auth:get-session',
  'auth:save-session',
  'auth:clear-session',
  'auth:get-supabase-config',

  // Auth — session sync (renderer -> main process)
  'auth:sync-session',
  'auth:clear-main-session',
  'auth:open-external',
  'auth:cancel-oauth-popup',
  'auth:open-oauth-popup',

  // Database — agent preferences (per-user model overrides)
  'db:agent-prefs:list',
  'db:agent-prefs:set',

  // Agent config refresh
  'agent:refresh-config',

  // App lifecycle — post-auth initialization
  'app:init-workspaces',

  // Direct agent messaging (sends to agent's running session)
  'task:message-agent',

  // Open an agent's workspace folder
  'agent:open-workspace',
];

const ALLOWED_ON = [
  // Gateway events forwarded from main process
  'gateway:event',
  'gateway:connected',
  'gateway:disconnected',
  'gateway:error',

  // Agent events
  'agent:status-changed',
  'agent:message-received',
  'agent:action-taken',

  // Security
  'security:checkpoint',
  'security:violation',

  // Task events
  'task:started',
  'task:progress',
  'task:completed',
  'task:failed',
  'task:cancelled',
  'task:clarify',
  'task:awaiting-input',
  'task:awaiting-approval',
  'task:quota-exhausted',

  // Chat streaming events
  'chat:message',

  // System
  'system:notification',

  // Auth events
  'auth:handle-deep-link',
  'auth:session-restored',
];

// ============================================================================
// EXPOSE SAFE API TO RENDERER
// ============================================================================

contextBridge.exposeInMainWorld('hivemind', {
  /**
   * Invoke an IPC handler in the main process and await the result.
   * Only channels in ALLOWED_INVOKE are permitted.
   */
  invoke: (channel, data) => {
    if (!ALLOWED_INVOKE.includes(channel)) {
      console.error(`[HiveMind Security] Blocked IPC invoke: "${channel}"`);
      return Promise.reject(new Error(`Channel "${channel}" is not permitted`));
    }
    return ipcRenderer.invoke(channel, data);
  },

  /**
   * Subscribe to an event channel from the main process.
   * Returns a cleanup function to unsubscribe.
   * Only channels in ALLOWED_ON are permitted.
   */
  on: (channel, callback) => {
    if (!ALLOWED_ON.includes(channel)) {
      console.error(`[HiveMind Security] Blocked IPC listener: "${channel}"`);
      return () => {};
    }
    const handler = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },

  /**
   * Subscribe to an event channel for a single emission only.
   * Only channels in ALLOWED_ON are permitted.
   */
  once: (channel, callback) => {
    if (!ALLOWED_ON.includes(channel)) {
      console.error(`[HiveMind Security] Blocked IPC once listener: "${channel}"`);
      return;
    }
    ipcRenderer.once(channel, (_event, ...args) => callback(...args));
  },

  /** The OS platform string (darwin, win32, linux) */
  platform: process.platform,

  /** Application version from package.json */
  version: process.env.npm_package_version || '0.1.0',
});

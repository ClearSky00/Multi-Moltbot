/**
 * OpenClaw Service — wraps ALL non-db IPC calls.
 *
 * Every function calls window.hivemind.invoke(channel, data).
 * This is the ONLY place in the renderer that touches window.hivemind
 * for non-database operations. Stores and components import from here.
 */

function invoke(channel, data) {
  return window.hivemind.invoke(channel, data);
}

// === AGENT MANAGEMENT ===
export function listAgents() {
  return invoke('agent:list');
}

export function getAgent(agentId) {
  return invoke('agent:get', { id: agentId });
}

export function createAgent(agentDef) {
  return invoke('agent:create', { agent: agentDef });
}

export function updateAgent(agentId, updates) {
  return invoke('agent:update', { id: agentId, updates });
}

export function deleteAgent(agentId) {
  return invoke('agent:delete', { id: agentId });
}

export function startAgent(agentId) {
  return invoke('agent:start', { id: agentId });
}

export function stopAgent(agentId) {
  return invoke('agent:stop', { id: agentId });
}

export function restartAgent(agentId) {
  return invoke('agent:restart', { id: agentId });
}

// === GOAL / TASK SUBMISSION ===
export function submitGoal(data) {
  return invoke('task:submit-goal', data);
}

export function cancelTask(data) {
  return invoke('task:cancel', data);
}

export function listTasks() {
  return invoke('task:list');
}

export function getTask(taskId) {
  return invoke('task:get', { taskId });
}

export function respondToTask(taskId, answer) {
  return invoke('task:respond', { taskId, answer });
}

export function resumeTask(taskId) {
  return invoke('task:resume', { taskId });
}

export function approveTask(taskId) {
  return invoke('task:approve', { taskId });
}

/**
 * Send a direct message to a specific agent's running gateway session.
 * Uses sessions_send via the OpenClaw gateway bridge.
 */
export function messageAgent(agentId, message) {
  return invoke('task:message-agent', { agentId, message });
}

// === SECURITY CHECKPOINT ===
export function respondCheckpoint(data) {
  return invoke('checkpoint:respond', data);
}

// === GATEWAY ===
export function getGatewayStatus() {
  return invoke('gateway:status');
}

export async function connectGateway(url) {
  const payload =
    url != null && String(url).trim()
      ? { url: String(url).trim() }
      : {};
  const result = await invoke('gateway:connect', payload);
  if (!result || result.ok === false) {
    throw new Error(
      result?.error ||
        'Could not connect to the gateway. Start OpenClaw or run npm run mock-gateway.'
    );
  }
  return result;
}

export function disconnectGateway() {
  return invoke('gateway:disconnect');
}

// === FILE SYSTEM ===
// All file operations are in src/services/fileService.js — import from there.

// === SKILLS ===
export function listGlobalSkills() {
  return invoke('skill:list-global');
}

export function listAgentSkills(agentId) {
  return invoke('skill:list-agent', { agentId });
}

export function installSkill(data) {
  return invoke('skill:install', data);
}

export function uninstallSkill(data) {
  return invoke('skill:uninstall', data);
}

export function enableSkill(data) {
  return invoke('skill:enable', data);
}

export function disableSkill(data) {
  return invoke('skill:disable', data);
}

export function searchSkillRegistry(query) {
  return invoke('skill:search-registry', { query });
}

// === SETTINGS ===
export function getSettings() {
  return invoke('settings:get');
}

export function saveSettings(settings) {
  return invoke('settings:save', settings);
}

export function saveApiKey(data) {
  return invoke('settings:save-api-key', data);
}

export function getApiKey(data) {
  return invoke('settings:get-api-key', data);
}

export function deleteApiKey(data) {
  return invoke('settings:delete-api-key', data);
}

// === CONFIG ===
export function readConfig() {
  return invoke('config:read');
}

export function writeConfig(config) {
  return invoke('config:write', config);
}

export function validateConfig(config) {
  return invoke('config:validate', config);
}

// === WINDOW CONTROLS ===
export function minimizeWindow() {
  return invoke('window:minimize');
}

export function maximizeWindow() {
  return invoke('window:maximize');
}

export function closeWindow() {
  return invoke('window:close');
}

export function isMaximized() {
  return invoke('window:is-maximized');
}

// === SYSTEM ===
export function openFolder(path) {
  return invoke('system:open-folder', { folderPath: path });
}

export function openclawStatus() {
  return invoke('system:openclaw-status');
}

export function getOpenclawVersion() {
  return invoke('system:get-openclaw-version');
}

export function detectGateway() {
  return invoke('system:detect-gateway');
}

// === AGENT CONFIG ===
export function refreshAgentConfig() {
  return invoke('agent:refresh-config');
}

/**
 * Open an agent's workspace folder in the system file manager.
 * Shows where the agent stores its task outputs, SOUL.md, memory, etc.
 */
export function openAgentWorkspace(agentId) {
  return invoke('agent:open-workspace', { agentId });
}

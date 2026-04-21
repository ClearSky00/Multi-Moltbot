/**
 * File Service — wraps all file:* IPC calls.
 *
 * Handles reading and writing of agent personality files (SOUL.md, AGENTS.md),
 * memory files, daily logs, and heartbeat configuration.
 * All calls go through window.hivemind.invoke.
 */

function invoke(channel, data) {
  return window.hivemind.invoke(channel, data);
}

/**
 * Read the SOUL.md identity file for a given agent.
 * @param {string} agentId
 * @returns {Promise<string>} The file contents.
 */
export function readSoul(agentId) {
  return invoke("file:read-soul", { agentName: agentId });
}

/**
 * Write the SOUL.md identity file for a given agent.
 * @param {string} agentId
 * @param {string} content - The full markdown content to write.
 * @returns {Promise<void>}
 */
export function writeSoul(agentId, content) {
  return invoke("file:write-soul", { agentName: agentId, content });
}

/**
 * Read the AGENTS.md operational instructions for a given agent.
 * @param {string} agentId
 * @returns {Promise<string>} The file contents.
 */
export function readAgentsMd(agentId) {
  return invoke("file:read-agents", { agentName: agentId });
}

/**
 * Write the AGENTS.md operational instructions for a given agent.
 * @param {string} agentId
 * @param {string} content - The full markdown content to write.
 * @returns {Promise<void>}
 */
export function writeAgentsMd(agentId, content) {
  return invoke("file:write-agents", { agentName: agentId, content });
}

/**
 * Read the MEMORY.md long-term memory file for a given agent.
 * @param {string} agentId
 * @returns {Promise<string>} The file contents.
 */
export function readMemory(agentId) {
  return invoke("file:read-memory", { agentName: agentId });
}

/**
 * Read daily log entries for a given agent.
 * Returns an object with date keys and content values.
 * @param {string} agentId
 * @returns {Promise<Object>} Daily logs keyed by date string.
 */
export function readDailyLogs(agentId, date) {
  return invoke("file:read-daily-logs", { agentName: agentId, date });
}

/**
 * Read the HEARTBEAT.md scheduled checklist for a given agent.
 * @param {string} agentId
 * @returns {Promise<string>} The file contents.
 */
export function readHeartbeat(agentId) {
  return invoke("file:read-heartbeat", { agentName: agentId });
}

/**
 * Write the HEARTBEAT.md scheduled checklist for a given agent.
 * @param {string} agentId
 * @param {string} content - The full markdown content to write.
 * @returns {Promise<void>}
 */
export function writeHeartbeat(agentId, content) {
  return invoke("file:write-heartbeat", { agentName: agentId, content });
}

/**
 * List all session metadata for a given agent.
 * @param {string} agentId
 * @returns {Promise<{data: Array}>}
 */
export function listSessions(agentId) {
  return invoke("file:read-sessions", { agentName: agentId });
}

/**
 * Read the JSONL log for a specific session.
 * @param {string} agentId
 * @param {string} sessionId
 * @returns {Promise<{data: Array}>}
 */
export function readSessionLog(agentId, sessionId) {
  return invoke("file:read-session-log", { agentName: agentId, sessionId });
}

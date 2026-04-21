/**
 * Skill Service — wraps all skill:* IPC calls.
 *
 * Handles listing, installing, uninstalling, enabling, disabling,
 * and searching skills for agents and the global skill registry.
 * All calls go through window.hivemind.invoke.
 */

function invoke(channel, data) {
  return window.hivemind.invoke(channel, data);
}

/**
 * List all globally installed skills.
 * @returns {Promise<Array>} Array of skill objects.
 */
export function listGlobalSkills() {
  return invoke("skill:list-global");
}

/**
 * List skills installed for a specific agent.
 * @param {string} agentId
 * @returns {Promise<Array>} Array of skill objects for the agent.
 */
export function listAgentSkills(agentId) {
  return invoke("skill:list-agent", { agentId });
}

/**
 * Install a skill. Can be global or agent-specific.
 * @param {Object} data
 * @param {string} data.skillName - The skill name or package identifier.
 * @param {string} [data.agentId] - If provided, installs for this agent only.
 * @param {string} [data.source] - Source URL or registry identifier.
 * @returns {Promise<Object>} Installation result.
 */
export function installSkill(data) {
  return invoke("skill:install", data);
}

/**
 * Uninstall a skill.
 * @param {Object} data
 * @param {string} data.skillName - The skill name to uninstall.
 * @param {string} [data.agentId] - If provided, uninstalls from this agent only.
 * @returns {Promise<void>}
 */
export function uninstallSkill(data) {
  return invoke("skill:uninstall", data);
}

/**
 * Enable a previously installed skill.
 * @param {Object} data
 * @param {string} data.skillName - The skill name to enable.
 * @param {string} [data.agentId] - If provided, enables for this agent only.
 * @returns {Promise<void>}
 */
export function enableSkill(data) {
  return invoke("skill:enable", data);
}

/**
 * Disable a skill without uninstalling it.
 * @param {Object} data
 * @param {string} data.skillName - The skill name to disable.
 * @param {string} [data.agentId] - If provided, disables for this agent only.
 * @returns {Promise<void>}
 */
export function disableSkill(data) {
  return invoke("skill:disable", data);
}

/**
 * Search the skill registry for available skills.
 * @param {string} query - Search query string.
 * @returns {Promise<Array>} Array of matching skill entries from the registry.
 */
export function searchSkillRegistry(query) {
  return invoke("skill:search-registry", { query });
}

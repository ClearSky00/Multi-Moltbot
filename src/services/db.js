/**
 * Database Service — wraps ALL db:* IPC calls.
 *
 * Every function calls window.hivemind.invoke('db:...', data).
 * This is the ONLY place in the renderer that touches window.hivemind
 * for database operations. Stores and components import from here.
 */

function invoke(channel, data) {
  return window.hivemind.invoke(channel, data);
}

// === AGENTS ===
export function listAgents() {
  return invoke("db:agents:list");
}

export function getAgent(agentId) {
  return invoke("db:agents:get", { id: agentId });
}

export function upsertAgent(agentDef) {
  return invoke("db:agents:upsert", { agent: agentDef });
}

export function deleteAgent(agentId) {
  return invoke("db:agents:delete", { id: agentId });
}

// === TASKS ===
export function listTasks() {
  return invoke("db:tasks:list");
}

export function createTask(task) {
  return invoke("db:tasks:create", { task });
}

export function updateTask(taskId, updates) {
  return invoke("db:tasks:update", { id: taskId, updates });
}

export function deleteTask(taskId) {
  return invoke("db:tasks:delete", { id: taskId });
}

// === AUDIT ===
export function appendAudit(entry) {
  return invoke("db:audit:append", { entry });
}

export function listAudit(filters) {
  return invoke("db:audit:list", filters);
}

// === CHECKPOINTS ===
export function createCheckpoint(checkpoint) {
  return invoke("db:checkpoints:create", { checkpoint });
}

export function resolveCheckpoint(checkpointId, resolution) {
  return invoke("db:checkpoints:resolve", { id: checkpointId, ...resolution });
}

// === SKILLS ===
export function listSkills(filters) {
  return invoke("db:skills:list", filters);
}

export function upsertSkill(skill) {
  return invoke("db:skills:upsert", { skill });
}

export function deleteSkill(skillId) {
  return invoke("db:skills:delete", { id: skillId });
}

export function toggleSkill(agentId, skillId, enabled) {
  return invoke("db:skills:upsert", {
    skill: { agent_id: agentId, id: skillId, enabled },
  });
}

export function installSkill(agentId, skillName) {
  return invoke("db:skills:upsert", {
    skill: { agent_id: agentId, name: skillName, enabled: true },
  });
}

export function uninstallSkill(agentId, skillId) {
  return invoke("db:skills:delete", { id: skillId });
}

// === BUILDS ===
export function listBuilds(filters) {
  return invoke("db:builds:list", filters);
}

export function getBuild(buildId) {
  return invoke("db:builds:get", { id: buildId });
}

export function createBuild(build) {
  return invoke("db:builds:create", { build });
}

export function updateBuild(buildId, updates) {
  return invoke("db:builds:update", { id: buildId, updates });
}

export function deleteBuild(buildId) {
  return invoke("db:builds:delete", { id: buildId });
}

// === SETTINGS ===
export function getSetting(key) {
  return invoke("db:settings:get", { key });
}

export function setSetting(key, value) {
  return invoke("db:settings:set", { key, value });
}

// === AGENT PREFERENCES ===
export function listAgentPrefs() {
  return invoke("db:agent-prefs:list");
}

export function setAgentPref(agentId, model) {
  return invoke("db:agent-prefs:set", { agentId, model });
}

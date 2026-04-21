"use strict";

const fs = require("fs").promises;
const path = require("path");
const {
  getOpenClawBase,
  getWorkspacePath,
  getAgentDir,
  isWithinOpenClaw,
  safeReadFile,
  safeWriteFile,
} = require("./pathUtils");

/**
 * Default content templates for workspace files.
 * These are only written when the file does not already exist.
 */
const DEFAULT_USER_MD = "# User\n\nThe user of HiveMind OS.\n";
const DEFAULT_HEARTBEAT_MD =
  "# Heartbeat\n\nChecklist for periodic heartbeat runs:\n\n- [ ] Check system health\n- [ ] Review pending tasks\n- [ ] Report status summary\n";
const DEFAULT_MEMORY_MD = "# Memory\n\nLong-term curated facts and context.\n";
const DEFAULT_TOOLS_MD =
  "# Tools\n\nLocal tool notes and conventions for this agent.\n";

/**
 * Ensure a single agent's workspace directory and all required files exist.
 * Never overwrites existing files — only creates missing ones.
 *
 * @param {string} agentId  The agent's stable identifier
 * @param {object} agentData  The agent record from the database
 * @param {string} [agentData.soul_content]  SOUL.md content from DB
 * @param {string} [agentData.agents_content]  AGENTS.md content from DB
 * @param {string} [agentData.name]  Agent display name
 * @param {string} [agentData.role]  Agent role description
 * @returns {Promise<{created: boolean, path: string, files: string[]}>}
 */
async function ensureWorkspace(agentId, agentData = {}) {
  const workspacePath = getWorkspacePath(agentId);

  if (!isWithinOpenClaw(workspacePath)) {
    throw new Error(
      `Invalid workspace path for agent "${agentId}": path traversal detected`,
    );
  }

  // Create workspace directory
  await fs.mkdir(workspacePath, { recursive: true });

  // Create subdirectories
  const memoryDir = path.join(workspacePath, "memory");
  const skillsDir = path.join(workspacePath, "skills");
  await fs.mkdir(memoryDir, { recursive: true });
  await fs.mkdir(skillsDir, { recursive: true });

  // Create agent sessions directory
  const agentDir = getAgentDir(agentId);
  const sessionsDir = path.join(agentDir, "sessions");
  await fs.mkdir(sessionsDir, { recursive: true });

  // Define required files with their content sources
  const name = agentData.name || agentId;
  const role = agentData.role || "";
  const defaultSoul = `# ${name}\n\nYou are ${name}. ${role}\n`;
  const defaultAgents = `# Operating Instructions\n\nInstructions for ${name}.\n`;
  const defaultIdentity = `# Identity\n\nname: ${name}\nemoji: \navatar: \n`;

  const requiredFiles = [
    { name: "SOUL.md", content: agentData.soul_content || defaultSoul },
    { name: "AGENTS.md", content: agentData.agents_content || defaultAgents },
    { name: "USER.md", content: DEFAULT_USER_MD },
    { name: "IDENTITY.md", content: defaultIdentity },
    { name: "TOOLS.md", content: DEFAULT_TOOLS_MD },
    { name: "HEARTBEAT.md", content: DEFAULT_HEARTBEAT_MD },
    { name: "MEMORY.md", content: DEFAULT_MEMORY_MD },
  ];

  const createdFiles = [];
  let anyCreated = false;

  for (const file of requiredFiles) {
    const filePath = path.join(workspacePath, file.name);
    const exists = await safeReadFile(filePath);
    if (exists === null) {
      await safeWriteFile(filePath, file.content);
      createdFiles.push(file.name);
      anyCreated = true;
    }
  }

  return {
    created: anyCreated,
    path: workspacePath,
    files: createdFiles,
  };
}

/**
 * Ensure all agent workspaces exist.
 * Called on app startup with the full agent list from the database.
 *
 * @param {object[]} agents  Array of agent records from the agents table
 * @returns {Promise<{total: number, created: number, results: object[]}>}
 */
async function ensureAllWorkspaces(agents) {
  const results = [];
  let createdCount = 0;

  for (const agent of agents) {
    try {
      const result = await ensureWorkspace(agent.id, agent);
      results.push({ agentId: agent.id, ...result });
      if (result.created) createdCount++;
    } catch (err) {
      console.error(
        `[workspaceManager] Failed to ensure workspace for "${agent.id}":`,
        err.message,
      );
      results.push({ agentId: agent.id, error: err.message });
    }
  }

  // Ensure the base OpenClaw directory structure
  const basePath = getOpenClawBase();
  await fs.mkdir(path.join(basePath, "skills"), { recursive: true });
  await fs.mkdir(path.join(basePath, "credentials"), { recursive: true });

  return {
    total: agents.length,
    created: createdCount,
    results,
  };
}

/**
 * Write skills from the database to disk.
 * Called on startup after fetching enabled skills from Supabase.
 * Never overwrites an existing SKILL.md — idempotent.
 *
 * @param {Array<{
 *   id: string,
 *   skill_id: string,
 *   agent_id: string|null,
 *   scope: 'global'|'agent',
 *   skill_content: string|null,
 *   enabled: boolean
 * }>} skills  Rows from the skills table
 */
async function writeSkillsToWorkspace(skills) {
  const base = getOpenClawBase();

  for (const skill of skills) {
    if (!skill.skill_content || !skill.enabled) continue;

    let skillDir;
    if (skill.scope === "agent" && skill.agent_id) {
      skillDir = path.join(getWorkspacePath(skill.agent_id), "skills", skill.skill_id);
    } else {
      skillDir = path.join(base, "skills", skill.skill_id);
    }

    try {
      await fs.mkdir(skillDir, { recursive: true });
      const skillPath = path.join(skillDir, "SKILL.md");
      const existing = await safeReadFile(skillPath);
      if (existing === null) {
        await safeWriteFile(skillPath, skill.skill_content);
        console.log(`[workspaceManager] wrote skill: ${skill.id} → ${skillPath}`);
      }
    } catch (err) {
      console.error(`[workspaceManager] failed to write skill "${skill.id}":`, err.message);
    }
  }
}

/**
 * Validate that a workspace has all required files.
 *
 * @param {string} agentId
 * @returns {Promise<{valid: boolean, missing: string[], path: string}>}
 */
async function validateWorkspace(agentId) {
  const workspacePath = getWorkspacePath(agentId);
  const requiredFiles = [
    "SOUL.md",
    "AGENTS.md",
    "USER.md",
    "IDENTITY.md",
    "TOOLS.md",
    "HEARTBEAT.md",
    "MEMORY.md",
  ];
  const missing = [];

  for (const fileName of requiredFiles) {
    const filePath = path.join(workspacePath, fileName);
    const content = await safeReadFile(filePath);
    if (content === null) {
      missing.push(fileName);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    path: workspacePath,
  };
}

module.exports = {
  ensureWorkspace,
  ensureAllWorkspaces,
  writeSkillsToWorkspace,
  validateWorkspace,
};

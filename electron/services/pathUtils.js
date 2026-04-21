"use strict";

const fs = require("fs").promises;
const path = require("path");
const os = require("os");

/**
 * Resolve the base OpenClaw directory (~/.openclaw).
 * @returns {string}
 */
function getOpenClawBase() {
  return path.join(os.homedir(), ".openclaw");
}

/**
 * Resolve the workspace directory for a given agent.
 * OpenClaw convention: ~/.openclaw/workspace-[agentId]/
 * @param {string} agentId
 * @returns {string}
 */
function getWorkspacePath(agentId) {
  return path.join(getOpenClawBase(), `workspace-${agentId}`);
}

/**
 * Resolve the agent directory for sessions and auth profiles.
 * OpenClaw convention: ~/.openclaw/agents/[agentId]/
 * @param {string} agentId
 * @returns {string}
 */
function getAgentDir(agentId) {
  return path.join(getOpenClawBase(), "agents", agentId);
}

/**
 * Validate that a resolved path stays within the OpenClaw base directory.
 * Prevents path traversal attacks.
 * @param {string} resolvedPath
 * @returns {boolean}
 */
function isWithinOpenClaw(resolvedPath) {
  const base = getOpenClawBase();
  const normalizedBase = path.normalize(base) + path.sep;
  const normalizedPath = path.normalize(resolvedPath);
  return (
    normalizedPath.startsWith(normalizedBase) ||
    normalizedPath === path.normalize(base)
  );
}

/**
 * Safely read a file, returning its contents as a string.
 * Returns null if the file does not exist or an error occurs.
 * @param {string} filePath
 * @returns {Promise<string|null>}
 */
async function safeReadFile(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content;
  } catch (err) {
    if (err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Safely write a file, creating parent directories as needed.
 * @param {string} filePath
 * @param {string} content
 */
async function safeWriteFile(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

module.exports = {
  getOpenClawBase,
  getWorkspacePath,
  getAgentDir,
  isWithinOpenClaw,
  safeReadFile,
  safeWriteFile,
};

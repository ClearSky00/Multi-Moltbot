"use strict";

const fs = require("fs").promises;
const path = require("path");
const {
  getOpenClawBase,
  getWorkspacePath,
  getAgentDir,
  safeReadFile,
} = require("./pathUtils");

/**
 * Build a provider base-URL lookup keyed by LiteLLM model prefix.
 * e.g. { "ollama": "http://100.122.171.104:11434", "openai": "https://..." }
 *
 * @param {object} rawProviders  Plain object of providers from electron-store
 * @returns {object}
 */
function buildProviderBaseUrls(rawProviders) {
  const map = {};
  for (const p of Object.values(rawProviders || {})) {
    if (p.enabled && p.baseUrl && p.type) {
      map[p.type] = p.baseUrl;
    }
  }
  return map;
}

/**
 * Scan a skills directory and return entry objects for each valid skill.
 * A valid skill has a SKILL.md file with parseable front matter.
 *
 * @param {string} dir         Skills directory to scan
 * @param {string} scope       "global" or "agent"
 * @param {string} [agentId]   Agent ID (only for scope="agent")
 * @returns {Promise<Array<{ id: string, name: string, description: string, scope: string, agentId?: string }>>}
 */
async function _scanSkillsDir(dir, scope, agentId) {
  const skills = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (_) {
    return skills;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillMdPath = path.join(dir, entry.name, "SKILL.md");
    try {
      const content = await fs.readFile(skillMdPath, "utf-8");
      // Parse basic front matter for name and description
      const nameMatch = content.match(/^name:\s*(.+)$/im);
      const descMatch = content.match(/^description:\s*(.+)$/im);
      skills.push({
        id: entry.name,
        name: nameMatch ? nameMatch[1].trim() : entry.name,
        description: descMatch ? descMatch[1].trim() : "",
        scope,
        ...(agentId ? { agentId } : {}),
      });
    } catch (_) {
      // No SKILL.md or unreadable — skip
    }
  }
  return skills;
}

/**
 * Scan all installed skills (global + per-agent) and build the skills.entries
 * object for openclaw.json. This ensures the gateway knows about all skills
 * regardless of which model provider is in use.
 *
 * @param {object[]} agents  Agent records
 * @returns {Promise<object>}  The skills.entries map
 */
async function scanInstalledSkills(agents) {
  const entries = {};

  // Global skills
  const globalDir = path.join(getOpenClawBase(), "skills");
  const globalSkills = await _scanSkillsDir(globalDir, "global");
  for (const skill of globalSkills) {
    entries[skill.id] = { enabled: true };
  }

  // Per-agent skills
  for (const agent of agents) {
    const agentSkillDir = path.join(getWorkspacePath(agent.id), "skills");
    const agentSkills = await _scanSkillsDir(agentSkillDir, "agent", agent.id);
    for (const skill of agentSkills) {
      entries[`${agent.id}:${skill.id}`] = { enabled: true };
    }
  }

  return entries;
}

/**
 * Build the openclaw.json configuration object from an array of agent records.
 * This config drives the OpenClaw Gateway — it defines all agents, their workspaces,
 * models, tools, and gateway settings.
 *
 * Only produces fields recognized by the OpenClaw CLI schema:
 * - agents.defaults: workspace, model, sandbox, heartbeat, compaction
 * - agents.list: per-agent overrides with identity, tools, sandbox
 * - gateway: port, bind, auth, controlUi, reload
 * - skills: entries, load config
 * - session: dmScope, reset, maintenance
 *
 * CLI-managed sections (plugins, wizard, meta) are preserved by writeConfig
 * via merge — buildConfig does not emit them.
 *
 * @param {object[]} agents  Agent records from the Supabase `agents` table
 * @param {object}   [options]
 * @param {number}   [options.gatewayPort=18789]
 * @param {string}   [options.authMode='token']
 * @param {object}   [options.providerBaseUrls]  Map of provider type -> base URL
 * @param {object}   [options.skillEntries]  Pre-scanned skill entries (from scanInstalledSkills)
 * @returns {object}  The complete openclaw.json structure
 */
function buildConfig(agents, options = {}) {
  const { gatewayPort = 18789, authMode = "token", providerBaseUrls = {}, skillEntries = {} } = options;

  const agentList = agents.map((agent) => {
    const model = (agent.model || "").trim();
    const entry = {
      id: agent.id,
      workspace: agent.workspace || getWorkspacePath(agent.id),
      agentDir: getAgentDir(agent.id),
      model,
      identity: {
        name: agent.name,
        emoji: "",
        avatar: "",
      },
      tools: {
        allow: (agent.tools_allow || []).filter(
          (t) => !(agent.tools_deny || []).includes(t),
        ),
        deny: agent.tools_deny || [],
      },
      sandbox: {
        mode: agent.sandbox_mode || "all",
      },
    };

    // Mark orchestrator as default agent
    if (agent.id === "orchestrator") {
      entry.default = true;
    }
    return entry;
  });

  // Find the default model from the majority of agents
  const modelCounts = {};
  for (const agent of agents) {
    const m = (agent.model || "gemini/gemini-2.0-flash").trim();
    modelCounts[m] = (modelCounts[m] || 0) + 1;
  }
  const defaultModel =
    Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    "gemini/gemini-2.0-flash";

  return {
    agents: {
      defaults: {
        workspace: getOpenClawBase(),
        model: { primary: defaultModel },
        sandbox: { mode: "all" },
        heartbeat: { every: "30m", target: "last" },
        compaction: { mode: "safeguard" },
      },
      list: agentList,
    },
    gateway: {
      mode: "local",
      port: gatewayPort,
      bind: "loopback",
      auth: { mode: authMode },
      controlUi: { enabled: true, basePath: "/openclaw" },
      reload: { mode: "hybrid" },
    },
    tools: {
      profile: "coding",
      exec: { backgroundMs: 10000, timeoutSec: 1800 },
      sessions: { visibility: "tree" },
    },
    skills: {
      entries: skillEntries,
      load: {
        watch: true,
        watchDebounceMs: 500,
      },
    },
    session: {
      scope: "per-sender",
      dmScope: "main",
      reset: { mode: "daily", atHour: 4 },
      maintenance: { pruneAfter: "30d", maxEntries: 500 },
    },
    bindings: [],
  };
}

/**
 * Write the generated config to ~/.openclaw/openclaw.json.
 * Creates the directory if it does not exist.
 *
 * Reads the existing config first and merges so that CLI-managed sections
 * (plugins, wizard, meta, gateway.auth.token) are preserved. Our sections
 * (agents, gateway basics, tools, skills, session, bindings) always win.
 *
 * @param {object[]} agents  Agent records from the database
 * @param {object}   [options]  Options passed to buildConfig
 * @returns {Promise<{written: boolean, path: string, agentCount: number}>}
 */
async function writeConfig(agents, options = {}) {
  // Auto-load provider base URLs from electron-store if not provided
  let providerBaseUrls = options.providerBaseUrls;
  if (!providerBaseUrls) {
    try {
      const { default: Store } = await import("electron-store");
      const ps = new Store({ name: "hivemind-providers" });
      const rawProviders = ps.get("providers") || {};
      providerBaseUrls = buildProviderBaseUrls(rawProviders);
    } catch (err) {
      console.warn("[openclawConfig] Could not load providers for api_base:", err.message);
      providerBaseUrls = {};
    }
  }

  // Scan installed skills so they're registered in the config for all models
  let skillEntries = options.skillEntries;
  if (!skillEntries) {
    try {
      skillEntries = await scanInstalledSkills(agents);
    } catch (err) {
      console.warn("[openclawConfig] Could not scan skills:", err.message);
      skillEntries = {};
    }
  }

  const generated = buildConfig(agents, { ...options, providerBaseUrls, skillEntries });
  const configPath = path.join(getOpenClawBase(), "openclaw.json");

  await fs.mkdir(getOpenClawBase(), { recursive: true });

  // Read existing config to preserve CLI-managed sections
  const existing = await readConfig();

  // Merge: our generated config takes precedence for sections we manage,
  // but we preserve CLI-owned top-level sections and gateway.auth extras.
  const merged = { ...existing, ...generated };

  // Preserve gateway.auth.token if the CLI set one and we don't override it
  if (existing?.gateway?.auth?.token && !generated.gateway.auth.token) {
    merged.gateway = {
      ...generated.gateway,
      auth: { ...generated.gateway.auth, token: existing.gateway.auth.token },
    };
  }

  // Preserve CLI-managed sections that buildConfig doesn't emit
  if (existing?.plugins) merged.plugins = existing.plugins;
  if (existing?.wizard) merged.wizard = existing.wizard;
  if (existing?.meta) merged.meta = existing.meta;

  await fs.writeFile(configPath, JSON.stringify(merged, null, 2), "utf-8");

  return {
    written: true,
    path: configPath,
    agentCount: agents.length,
  };
}

/**
 * Read the current openclaw.json config from disk.
 * Returns null if the file does not exist.
 *
 * @returns {Promise<object|null>}
 */
async function readConfig() {
  const configPath = path.join(getOpenClawBase(), "openclaw.json");
  const content = await safeReadFile(configPath);
  if (content === null) return null;

  try {
    return JSON.parse(content);
  } catch (err) {
    console.error(
      "[openclawConfig] Failed to parse openclaw.json:",
      err.message,
    );
    return null;
  }
}

module.exports = {
  buildConfig,
  writeConfig,
  readConfig,
  scanInstalledSkills,
};

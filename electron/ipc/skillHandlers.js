"use strict";

const { ipcMain } = require("electron");
const fs = require("fs").promises;
const path = require("path");
const { getSupabase } = require("../services/supabase");
const requireAuth = require("./requireAuth");
const { getOpenClawBase, getWorkspacePath } = require("../services/pathUtils");

/**
 * Resolve the global skills directory.
 */
function getGlobalSkillsDir() {
  return path.join(getOpenClawBase(), "skills");
}

/**
 * Resolve the agent-specific skills directory.
 */
function getAgentSkillsDir(agentName) {
  return path.join(getWorkspacePath(agentName), "skills");
}

/**
 * Parse a SKILL.md file's front matter and body.
 * Front matter is delimited by --- lines at the top.
 * Returns { meta: {...}, body: "..." }
 */
function parseSkillMd(content) {
  const lines = content.split("\n");
  const meta = {};
  let body = content;
  let inFrontMatter = false;
  let frontMatterEnd = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (i === 0 && line === "---") {
      inFrontMatter = true;
      continue;
    }
    if (inFrontMatter && line === "---") {
      frontMatterEnd = i + 1;
      break;
    }
    if (inFrontMatter) {
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        const key = line.substring(0, colonIdx).trim();
        let value = line.substring(colonIdx + 1).trim();
        // Handle YAML-like arrays (single-line list items after a key)
        if (value === "") {
          // Collect subsequent lines that start with "  -" as array values
          const arr = [];
          for (let j = i + 1; j < lines.length; j++) {
            const arrLine = lines[j];
            if (arrLine.match(/^\s+-\s+/)) {
              arr.push(arrLine.replace(/^\s+-\s+/, "").trim());
              i = j; // advance outer loop
            } else {
              break;
            }
          }
          if (arr.length > 0) {
            value = arr;
          }
        }
        meta[key] = value;
      }
    }
  }

  if (frontMatterEnd > 0) {
    body = lines.slice(frontMatterEnd).join("\n").trim();
  }

  return { meta, body };
}

/**
 * Read all SKILL.md files from a directory, returning an array of parsed skill objects.
 * @param {string} skillsDir
 * @param {string} scope  "global" or "agent"
 * @returns {Promise<Array>}
 */
async function readSkillsFromDir(skillsDir, scope) {
  const skills = [];

  let entries;
  try {
    entries = await fs.readdir(skillsDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return skills;
    throw err;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillMdPath = path.join(skillsDir, entry.name, "SKILL.md");
    try {
      const content = await fs.readFile(skillMdPath, "utf-8");
      const { meta, body } = parseSkillMd(content);
      skills.push({
        id: entry.name,
        name: meta.name || entry.name,
        description: meta.description || "",
        version: meta.version || "0.0.0",
        author: meta.author || "unknown",
        tools: Array.isArray(meta.tools) ? meta.tools : [],
        env: Array.isArray(meta.env) ? meta.env : [],
        scope,
        directory: path.join(skillsDir, entry.name),
        body,
        raw: content,
      });
    } catch (_) {
      // Skip directories without a valid SKILL.md
    }
  }

  return skills;
}

/**
 * Register all skill:* IPC handlers.
 * @param {Electron.BrowserWindow} mainWindow
 */
module.exports = function registerSkillHandlers(mainWindow) {
  // ---------------------------------------------------------------------------
  // skill:list-global — List all globally installed skills from ~/.openclaw/skills/
  // ---------------------------------------------------------------------------
  ipcMain.handle("skill:list-global", async () => {
    try {
      const skills = await readSkillsFromDir(getGlobalSkillsDir(), "global");
      return { data: skills };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // skill:list-agent — List skills installed for a specific agent.
  // ---------------------------------------------------------------------------
  ipcMain.handle("skill:list-agent", async (_event, { agentName }) => {
    if (!agentName) return { error: "agentName is required" };

    try {
      const agentSkills = await readSkillsFromDir(
        getAgentSkillsDir(agentName),
        "agent",
      );
      const globalSkills = await readSkillsFromDir(
        getGlobalSkillsDir(),
        "global",
      );

      // Merge: agent skills override global skills with the same name
      const skillMap = new Map();
      for (const skill of globalSkills) {
        skillMap.set(skill.id, { ...skill, overridden: false });
      }
      for (const skill of agentSkills) {
        if (skillMap.has(skill.id)) {
          skillMap.set(skill.id, {
            ...skill,
            overridden: true,
            overrides: "global",
          });
        } else {
          skillMap.set(skill.id, skill);
        }
      }

      return { data: Array.from(skillMap.values()) };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // skill:install — Install a skill by creating its directory and SKILL.md.
  // Can install globally or for a specific agent.
  // ---------------------------------------------------------------------------
  ipcMain.handle(
    "skill:install",
    async (_event, { skillId, content, scope, agentName }) => {
      if (!skillId) return { error: "skillId is required" };
      if (!content) return { error: "content (SKILL.md) is required" };

      const auth = requireAuth();
      if (auth.error) return { error: auth.error };

      const targetDir =
        scope === "agent" && agentName
          ? path.join(getAgentSkillsDir(agentName), skillId)
          : path.join(getGlobalSkillsDir(), skillId);

      try {
        await fs.mkdir(targetDir, { recursive: true });
        await fs.writeFile(path.join(targetDir, "SKILL.md"), content, "utf-8");

        // Persist to Supabase
        const supabase = getSupabase();
        if (supabase) {
          const { meta } = parseSkillMd(content);
          await supabase.from("skills").upsert(
            {
              id: `${scope === "agent" ? agentName + ":" : ""}${skillId}`,
              skill_id: skillId,
              name: meta.name || skillId,
              description: meta.description || "",
              version: meta.version || "0.0.0",
              scope: scope || "global",
              agent_id: agentName || null,
              enabled: true,
              installed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" },
          );
        }

        return { data: { installed: true, skillId, directory: targetDir } };
      } catch (err) {
        return { error: err.message };
      }
    },
  );

  // ---------------------------------------------------------------------------
  // skill:uninstall — Remove a skill directory and its DB record.
  // ---------------------------------------------------------------------------
  ipcMain.handle(
    "skill:uninstall",
    async (_event, { skillId, scope, agentName }) => {
      if (!skillId) return { error: "skillId is required" };

      const auth = requireAuth();
      if (auth.error) return { error: auth.error };

      const targetDir =
        scope === "agent" && agentName
          ? path.join(getAgentSkillsDir(agentName), skillId)
          : path.join(getGlobalSkillsDir(), skillId);

      try {
        await fs.rm(targetDir, { recursive: true, force: true });

        // Remove from Supabase
        const supabase = getSupabase();
        if (supabase) {
          const dbId = `${scope === "agent" ? agentName + ":" : ""}${skillId}`;
          await supabase.from("skills").delete().eq("id", dbId);
        }

        return { data: { uninstalled: true, skillId } };
      } catch (err) {
        return { error: err.message };
      }
    },
  );

  // ---------------------------------------------------------------------------
  // skill:enable — Enable a skill (set enabled=true in DB).
  // ---------------------------------------------------------------------------
  ipcMain.handle(
    "skill:enable",
    async (_event, { skillId, scope, agentName }) => {
      if (!skillId) return { error: "skillId is required" };

      const auth = requireAuth();
      if (auth.error) return { error: auth.error };

      const supabase = getSupabase();
      if (!supabase) return { error: "Supabase not configured" };

      const dbId = `${scope === "agent" && agentName ? agentName + ":" : ""}${skillId}`;

      const { data, error } = await supabase
        .from("skills")
        .update({ enabled: true, updated_at: new Date().toISOString() })
        .eq("id", dbId)
        .select()
        .single();

      if (error) return { error: error.message };
      return { data };
    },
  );

  // ---------------------------------------------------------------------------
  // skill:disable — Disable a skill (set enabled=false in DB).
  // ---------------------------------------------------------------------------
  ipcMain.handle(
    "skill:disable",
    async (_event, { skillId, scope, agentName }) => {
      if (!skillId) return { error: "skillId is required" };

      const auth = requireAuth();
      if (auth.error) return { error: auth.error };

      const supabase = getSupabase();
      if (!supabase) return { error: "Supabase not configured" };

      const dbId = `${scope === "agent" && agentName ? agentName + ":" : ""}${skillId}`;

      const { data, error } = await supabase
        .from("skills")
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .eq("id", dbId)
        .select()
        .single();

      if (error) return { error: error.message };
      return { data };
    },
  );

  // ---------------------------------------------------------------------------
  // skill:search-registry — Search for skills in the ClawHub registry.
  // For now this reads from the local global skills directory and filters.
  // In a future version this would call the ClawHub API.
  // ---------------------------------------------------------------------------
  ipcMain.handle("skill:search-registry", async (_event, { query }) => {
    try {
      const allSkills = await readSkillsFromDir(getGlobalSkillsDir(), "global");

      if (!query || query.trim() === "") {
        return { data: allSkills };
      }

      const lowerQuery = query.toLowerCase();
      const filtered = allSkills.filter(
        (skill) =>
          skill.name.toLowerCase().includes(lowerQuery) ||
          skill.description.toLowerCase().includes(lowerQuery) ||
          skill.id.toLowerCase().includes(lowerQuery),
      );

      return { data: filtered };
    } catch (err) {
      return { error: err.message };
    }
  });
};

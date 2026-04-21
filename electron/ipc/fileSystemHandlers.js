"use strict";

const { ipcMain } = require("electron");
const fs = require("fs").promises;
const path = require("path");
const { getSupabase } = require("../services/supabase");
const requireAuth = require("./requireAuth");
const {
  getOpenClawBase,
  getWorkspacePath,
  isWithinOpenClaw,
  safeReadFile,
  safeWriteFile,
} = require("../services/pathUtils");

/**
 * Register all file:* IPC handlers.
 * These handlers read and write agent workspace files on the local filesystem
 * and keep the corresponding Supabase columns in sync.
 * @param {Electron.BrowserWindow} mainWindow
 */
module.exports = function registerFileSystemHandlers(mainWindow) {
  // ---------------------------------------------------------------------------
  // file:read-soul — Read SOUL.md from an agent's workspace.
  // ---------------------------------------------------------------------------
  ipcMain.handle("file:read-soul", async (_event, { agentName }) => {
    if (!agentName) return { error: "agentName is required" };

    const filePath = path.join(getWorkspacePath(agentName), "SOUL.md");
    if (!isWithinOpenClaw(filePath)) {
      return { error: "Invalid path: outside OpenClaw directory" };
    }

    try {
      const content = await safeReadFile(filePath);
      return { data: { content, exists: content !== null, path: filePath } };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // file:write-soul — Write SOUL.md to an agent's workspace and sync to DB.
  // ---------------------------------------------------------------------------
  ipcMain.handle("file:write-soul", async (_event, { agentName, content }) => {
    if (!agentName) return { error: "agentName is required" };
    if (typeof content !== "string")
      return { error: "content must be a string" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const filePath = path.join(getWorkspacePath(agentName), "SOUL.md");
    if (!isWithinOpenClaw(filePath)) {
      return { error: "Invalid path: outside OpenClaw directory" };
    }

    try {
      await safeWriteFile(filePath, content);

      // Sync the soul_content column in Supabase
      const supabase = getSupabase();
      if (supabase) {
        await supabase
          .from("agents")
          .update({
            soul_content: content,
            updated_at: new Date().toISOString(),
          })
          .eq("id", agentName);
      }

      return {
        data: {
          written: true,
          path: filePath,
          bytes: Buffer.byteLength(content),
        },
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // file:read-agents — Read AGENTS.md from an agent's workspace.
  // ---------------------------------------------------------------------------
  ipcMain.handle("file:read-agents", async (_event, { agentName }) => {
    if (!agentName) return { error: "agentName is required" };

    const filePath = path.join(getWorkspacePath(agentName), "AGENTS.md");
    if (!isWithinOpenClaw(filePath)) {
      return { error: "Invalid path: outside OpenClaw directory" };
    }

    try {
      const content = await safeReadFile(filePath);
      return { data: { content, exists: content !== null, path: filePath } };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // file:write-agents — Write AGENTS.md to an agent's workspace and sync to DB.
  // ---------------------------------------------------------------------------
  ipcMain.handle(
    "file:write-agents",
    async (_event, { agentName, content }) => {
      if (!agentName) return { error: "agentName is required" };
      if (typeof content !== "string")
        return { error: "content must be a string" };

      const auth = requireAuth();
      if (auth.error) return { error: auth.error };

      const filePath = path.join(getWorkspacePath(agentName), "AGENTS.md");
      if (!isWithinOpenClaw(filePath)) {
        return { error: "Invalid path: outside OpenClaw directory" };
      }

      try {
        await safeWriteFile(filePath, content);

        // Sync the agents_content column in Supabase
        const supabase = getSupabase();
        if (supabase) {
          await supabase
            .from("agents")
            .update({
              agents_content: content,
              updated_at: new Date().toISOString(),
            })
            .eq("id", agentName);
        }

        return {
          data: {
            written: true,
            path: filePath,
            bytes: Buffer.byteLength(content),
          },
        };
      } catch (err) {
        return { error: err.message };
      }
    },
  );

  // ---------------------------------------------------------------------------
  // file:read-memory — Read MEMORY.md from an agent's workspace.
  // ---------------------------------------------------------------------------
  ipcMain.handle("file:read-memory", async (_event, { agentName }) => {
    if (!agentName) return { error: "agentName is required" };

    const filePath = path.join(getWorkspacePath(agentName), "MEMORY.md");
    if (!isWithinOpenClaw(filePath)) {
      return { error: "Invalid path: outside OpenClaw directory" };
    }

    try {
      const content = await safeReadFile(filePath);
      return { data: { content, exists: content !== null, path: filePath } };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // file:read-daily-logs — Read daily log files from an agent's memory/ directory.
  // Accepts optional date (YYYY-MM-DD) or returns today's and yesterday's logs.
  // ---------------------------------------------------------------------------
  ipcMain.handle(
    "file:read-daily-logs",
    async (_event, { agentName, date, days }) => {
      if (!agentName) return { error: "agentName is required" };

      const memoryDir = path.join(getWorkspacePath(agentName), "memory");

      try {
        // If a specific date is requested, read just that file
        if (date) {
          const filePath = path.join(memoryDir, `${date}.md`);
          if (!isWithinOpenClaw(filePath)) {
            return { error: "Invalid path: outside OpenClaw directory" };
          }
          const content = await safeReadFile(filePath);
          return {
            data: { logs: [{ date, content, exists: content !== null }] },
          };
        }

        // Default: read today's and yesterday's logs, or a specified number of recent days
        const numDays =
          typeof days === "number" && days > 0 ? Math.min(days, 30) : 2;
        const logs = [];

        for (let i = 0; i < numDays; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split("T")[0];
          const filePath = path.join(memoryDir, `${dateStr}.md`);

          if (!isWithinOpenClaw(filePath)) continue;

          const content = await safeReadFile(filePath);
          logs.push({ date: dateStr, content, exists: content !== null });
        }

        // Also try to list all available log files for the date picker UI
        let availableDates = [];
        try {
          const files = await fs.readdir(memoryDir);
          availableDates = files
            .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
            .map((f) => f.replace(".md", ""))
            .sort()
            .reverse();
        } catch (_) {
          // Directory may not exist yet
        }

        return { data: { logs, availableDates } };
      } catch (err) {
        return { error: err.message };
      }
    },
  );

  // ---------------------------------------------------------------------------
  // file:read-heartbeat — Read HEARTBEAT.md from an agent's workspace.
  // ---------------------------------------------------------------------------
  ipcMain.handle("file:read-heartbeat", async (_event, { agentName }) => {
    if (!agentName) return { error: "agentName is required" };

    const filePath = path.join(getWorkspacePath(agentName), "HEARTBEAT.md");
    if (!isWithinOpenClaw(filePath)) {
      return { error: "Invalid path: outside OpenClaw directory" };
    }

    try {
      const content = await safeReadFile(filePath);
      return { data: { content, exists: content !== null, path: filePath } };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // file:write-heartbeat — Write HEARTBEAT.md to an agent's workspace.
  // ---------------------------------------------------------------------------
  ipcMain.handle(
    "file:write-heartbeat",
    async (_event, { agentName, content }) => {
      if (!agentName) return { error: "agentName is required" };
      if (typeof content !== "string")
        return { error: "content must be a string" };

      const filePath = path.join(getWorkspacePath(agentName), "HEARTBEAT.md");
      if (!isWithinOpenClaw(filePath)) {
        return { error: "Invalid path: outside OpenClaw directory" };
      }

      try {
        await safeWriteFile(filePath, content);
        return {
          data: {
            written: true,
            path: filePath,
            bytes: Buffer.byteLength(content),
          },
        };
      } catch (err) {
        return { error: err.message };
      }
    },
  );

  // ---------------------------------------------------------------------------
  // file:read-sessions — List session metadata for an agent.
  // Reads ~/.openclaw/agents/[agentName]/sessions/ and returns session headers.
  // ---------------------------------------------------------------------------
  ipcMain.handle("file:read-sessions", async (_event, { agentName }) => {
    if (!agentName) return { error: "agentName is required" };

    const sessionsDir = path.join(
      getOpenClawBase(),
      "agents",
      agentName,
      "sessions",
    );
    if (!isWithinOpenClaw(sessionsDir)) {
      return { error: "Invalid path: outside OpenClaw directory" };
    }

    try {
      let files;
      try {
        files = await fs.readdir(sessionsDir);
      } catch (err) {
        if (err.code === "ENOENT") return { data: [] };
        throw err;
      }

      const jsonlFiles = files
        .filter((f) => f.endsWith(".jsonl"))
        .sort()
        .reverse();
      const sessions = [];

      for (const file of jsonlFiles.slice(0, 50)) {
        const filePath = path.join(sessionsDir, file);
        if (!isWithinOpenClaw(filePath)) continue;

        try {
          const raw = await fs.readFile(filePath, "utf-8");
          const lines = raw.split("\n").filter(Boolean);
          if (lines.length === 0) continue;

          // First line is the session header
          const header = JSON.parse(lines[0]);
          sessions.push({
            id: file.replace(".jsonl", ""),
            startedAt: header.startedAt || header.timestamp || null,
            goal: header.goal || header.task || null,
            messageCount: lines.length,
          });
        } catch (_) {
          // Skip malformed files
        }
      }

      return { data: sessions };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // file:read-session-log — Read the full JSONL log for a specific session.
  // ---------------------------------------------------------------------------
  ipcMain.handle(
    "file:read-session-log",
    async (_event, { agentName, sessionId }) => {
      if (!agentName) return { error: "agentName is required" };
      if (!sessionId) return { error: "sessionId is required" };

      // Prevent path traversal — session IDs should be plain filenames
      const safeSessionId = path.basename(sessionId);
      const filePath = path.join(
        getOpenClawBase(),
        "agents",
        agentName,
        "sessions",
        `${safeSessionId}.jsonl`,
      );

      if (!isWithinOpenClaw(filePath)) {
        return { error: "Invalid path: outside OpenClaw directory" };
      }

      try {
        const raw = await safeReadFile(filePath);
        if (!raw) return { data: [] };

        const lines = raw
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch (_) {
              return line;
            }
          });

        return { data: lines };
      } catch (err) {
        return { error: err.message };
      }
    },
  );
};

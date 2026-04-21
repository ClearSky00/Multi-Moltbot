"use strict";

const { ipcMain, shell, safeStorage, app } = require("electron");
const { exec } = require("child_process");
const { promisify } = require("util");
const os = require("os");
const fs = require("fs").promises;
const path = require("path");
const { getOpenClawBase } = require("../services/pathUtils");

const execAsync = promisify(exec);

// electron-store v9 is ESM-only — lazy-init via dynamic import()
let store = null;
let keyStore = null;

async function getStore() {
  if (!store) {
    const { default: Store } = await import("electron-store");
    store = new Store({
      name: "hivemind-settings",
      defaults: {
        // gateway_url / gatewayUrl omitted — set when user saves from Settings; until then main uses .env / default
        autoStartGateway: false,
        approvalThreshold: "medium",
        autoRejectMinutes: 0,
        sandboxMode: "all",
        auditLogging: true,
        promptInjectionProtection: "balanced",
        font_scale: "100",
        openclawPath: "",
      },
    });
  }
  return store;
}

async function getKeyStore() {
  if (!keyStore) {
    const { default: Store } = await import("electron-store");
    keyStore = new Store({
      name: "hivemind-keys",
      defaults: {},
    });
  }
  return keyStore;
}

/**
 * Mask an API key for safe display in the renderer.
 * Shows first 4 + "..." + last 4 characters.
 * Keys shorter than 12 chars are fully masked.
 * @param {string} key
 * @returns {string}
 */
function maskApiKey(key) {
  if (!key || key.length < 12) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/**
 * Decrypt a stored API key in the main process.
 * INTERNAL USE ONLY — never call from IPC handlers that return to renderer.
 * @param {string} provider
 * @returns {Promise<string|null>}
 */
async function decryptApiKey(provider) {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const ks = await getKeyStore();
    const base64 = ks.get(`apiKeys.${provider}`);
    if (!base64) return null;
    return safeStorage.decryptString(Buffer.from(base64, "base64"));
  } catch {
    return null;
  }
}

/**
 * Register all system:*, window:*, settings:*, and config:* IPC handlers.
 * @param {Electron.BrowserWindow} mainWindow
 */
module.exports = function registerSystemHandlers(mainWindow) {
  // ===========================================================================
  // WINDOW CONTROLS
  // ===========================================================================

  ipcMain.handle("window:minimize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
    return { ok: true };
  });

  ipcMain.handle("window:maximize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
    return {
      ok: true,
      maximized: mainWindow ? mainWindow.isMaximized() : false,
    };
  });

  ipcMain.handle("window:close", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
    return { ok: true };
  });

  ipcMain.handle("window:is-maximized", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      return { maximized: mainWindow.isMaximized() };
    }
    return { maximized: false };
  });

  // ===========================================================================
  // SYSTEM OPERATIONS
  // ===========================================================================

  /**
   * system:open-folder — Open a folder in the system file explorer.
   */
  ipcMain.handle("system:open-folder", async (_event, { folderPath }) => {
    if (!folderPath) return { error: "folderPath is required" };

    // Resolve ~ to home directory
    const resolved = folderPath.startsWith("~")
      ? path.join(os.homedir(), folderPath.slice(1))
      : folderPath;

    try {
      await shell.openPath(resolved);
      return { ok: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  /**
   * system:openclaw-status — Check if the OpenClaw daemon is running.
   */
  ipcMain.handle("system:openclaw-status", async () => {
    try {
      // Try to find the openclaw process
      const command =
        process.platform === "win32"
          ? 'tasklist /fi "imagename eq openclaw.exe" /fo csv /nh'
          : "pgrep -x openclaw";

      const { stdout } = await execAsync(command);

      const isRunning =
        process.platform === "win32"
          ? stdout.toLowerCase().includes("openclaw.exe")
          : stdout.trim().length > 0;

      return {
        data: {
          running: isRunning,
          checkedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      // pgrep returns exit code 1 when no process is found — that is not an error
      return {
        data: {
          running: false,
          checkedAt: new Date().toISOString(),
        },
      };
    }
  });

  /**
   * system:get-openclaw-version — Get the installed OpenClaw version.
   */
  ipcMain.handle("system:get-openclaw-version", async () => {
    try {
      const { stdout } = await execAsync("openclaw --version");
      const version = stdout.trim();
      return { data: { version, installed: true } };
    } catch (err) {
      return { data: { version: null, installed: false, error: err.message } };
    }
  });

  /**
   * system:detect-gateway — Attempt to detect the Gateway by checking
   * if something is listening on the default port.
   */
  ipcMain.handle("system:detect-gateway", async () => {
    const s = await getStore();
    const gatewayUrl =
      s.get("gateway_url") || s.get("gatewayUrl") || "ws://127.0.0.1:18789";
    const WebSocket = require("ws");

    return new Promise((resolve) => {
      const ws = new WebSocket(gatewayUrl, {
        handshakeTimeout: 3000,
      });

      const timer = setTimeout(() => {
        ws.close();
        resolve({
          data: {
            detected: false,
            url: gatewayUrl,
            error: "Connection timeout",
          },
        });
      }, 5000);

      ws.on("open", () => {
        clearTimeout(timer);
        ws.close();
        resolve({ data: { detected: true, url: gatewayUrl } });
      });

      ws.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          data: { detected: false, url: gatewayUrl, error: err.message },
        });
      });
    });
  });

  // ===========================================================================
  // SETTINGS (electron-store — non-sensitive)
  // ===========================================================================

  /**
   * settings:get — Read a setting by key, or all settings if no key provided.
   */
  ipcMain.handle("settings:get", async (_event, { key } = {}) => {
    const s = await getStore();
    if (key) {
      return { data: { key, value: s.get(key) } };
    }
    const DEFAULT_WS = "ws://127.0.0.1:18789";
    const merged = { ...s.store };
    const url =
      (typeof merged.gateway_url === "string" && merged.gateway_url.trim()) ||
      (typeof merged.gatewayUrl === "string" && merged.gatewayUrl.trim()) ||
      DEFAULT_WS;
    merged.gateway_url = url;
    merged.gatewayUrl = url;
    return { data: merged };
  });

  /**
   * settings:save — Write one or more settings.
   * Accepts an object of key-value pairs.
   */
  ipcMain.handle("settings:save", async (_event, settings) => {
    if (!settings || typeof settings !== "object") {
      return { error: "settings must be an object" };
    }

    const s = await getStore();
    for (const [key, value] of Object.entries(settings)) {
      s.set(key, value);
    }

    return { data: { saved: true, keys: Object.keys(settings) } };
  });

  // ===========================================================================
  // API KEY MANAGEMENT (electron safeStorage — encrypted)
  // ===========================================================================

  /**
   * settings:save-api-key — Encrypt an API key using OS-level encryption
   * and store the encrypted blob as base64.
   */
  ipcMain.handle("settings:save-api-key", async (_event, { provider, key }) => {
    if (!provider) return { error: "provider is required" };
    if (!key) return { error: "key is required" };

    if (!safeStorage.isEncryptionAvailable()) {
      return { error: "OS encryption is not available on this system" };
    }

    try {
      const ks = await getKeyStore();
      const encrypted = safeStorage.encryptString(key);
      ks.set(`apiKeys.${provider}`, encrypted.toString("base64"));

      if (provider === "gateway_token") {
        const gatewayBridge = require("./gatewayBridge");
        const { loadGatewayToken } = require("../services/gatewayToken");
        try {
          gatewayBridge.setConnectToken(await loadGatewayToken());
        } catch (e) {
          gatewayBridge.setConnectToken("");
        }
        if (gatewayBridge._url && gatewayBridge.shouldReconnect) {
          gatewayBridge.connect(gatewayBridge._url);
        }
      }

      return { data: { saved: true, provider } };
    } catch (err) {
      return { error: err.message };
    }
  });

  /**
   * settings:get-api-key — Returns masked key status only.
   * The plaintext key NEVER leaves the main process.
   * Use decryptApiKey() internally for main-process operations.
   */
  ipcMain.handle("settings:get-api-key", async (_event, { provider }) => {
    if (!provider) return { error: "provider is required" };

    if (!safeStorage.isEncryptionAvailable()) {
      return { error: "OS encryption is not available on this system" };
    }

    try {
      const ks = await getKeyStore();
      const base64 = ks.get(`apiKeys.${provider}`);
      if (!base64) return { data: { provider, exists: false, masked: null } };

      const decrypted = safeStorage.decryptString(
        Buffer.from(base64, "base64"),
      );
      return { data: { provider, exists: true, masked: maskApiKey(decrypted) } };
    } catch (err) {
      return { error: err.message };
    }
  });

  /**
   * settings:delete-api-key — Remove a stored API key.
   */
  ipcMain.handle("settings:delete-api-key", async (_event, { provider }) => {
    if (!provider) return { error: "provider is required" };

    try {
      const ks = await getKeyStore();
      ks.delete(`apiKeys.${provider}`);

      if (provider === "gateway_token") {
        const gatewayBridge = require("./gatewayBridge");
        const { loadGatewayToken } = require("../services/gatewayToken");
        try {
          gatewayBridge.setConnectToken(await loadGatewayToken());
        } catch (e) {
          gatewayBridge.setConnectToken("");
        }
        if (gatewayBridge._url && gatewayBridge.shouldReconnect) {
          gatewayBridge.connect(gatewayBridge._url);
        }
      }

      return { data: { deleted: true, provider } };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ===========================================================================
  // OPENCLAW CONFIG (openclaw.json read/write/validate)
  // ===========================================================================

  /**
   * config:read — Read the openclaw.json master config file.
   */
  ipcMain.handle("config:read", async () => {
    const configPath = path.join(getOpenClawBase(), "openclaw.json");

    try {
      const content = await fs.readFile(configPath, "utf-8");
      // openclaw.json may be JSON5, but standard JSON.parse handles most cases.
      // If it has comments or trailing commas, we strip them for safety.
      const cleaned = content
        .replace(/\/\/.*$/gm, "") // Remove single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, "") // Remove multi-line comments
        .replace(/,(\s*[}\]])/g, "$1"); // Remove trailing commas

      const parsed = JSON.parse(cleaned);
      return { data: parsed };
    } catch (err) {
      if (err.code === "ENOENT") {
        return { data: null, exists: false };
      }
      return { error: err.message };
    }
  });

  /**
   * config:write — Write the openclaw.json master config file.
   */
  ipcMain.handle("config:write", async (_event, { config }) => {
    if (!config) return { error: "config object is required" };

    const configPath = path.join(getOpenClawBase(), "openclaw.json");

    try {
      await fs.mkdir(getOpenClawBase(), { recursive: true });
      const content = JSON.stringify(config, null, 2);
      await fs.writeFile(configPath, content, "utf-8");
      return {
        data: {
          written: true,
          path: configPath,
          bytes: Buffer.byteLength(content),
        },
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  /**
   * config:validate — Validate the openclaw.json structure.
   * Checks for required fields and returns a list of issues.
   */
  ipcMain.handle("config:validate", async (_event, { config } = {}) => {
    let configData = config;

    // If no config passed, read from disk
    if (!configData) {
      const configPath = path.join(getOpenClawBase(), "openclaw.json");
      try {
        const content = await fs.readFile(configPath, "utf-8");
        const cleaned = content
          .replace(/\/\/.*$/gm, "")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/,(\s*[}\]])/g, "$1");
        configData = JSON.parse(cleaned);
      } catch (err) {
        return {
          data: {
            valid: false,
            issues: [`Cannot read config: ${err.message}`],
          },
        };
      }
    }

    const issues = [];

    // Check top-level structure
    if (!configData.agents) {
      issues.push("Missing required field: agents");
    } else {
      if (!configData.agents.defaults) {
        issues.push("Missing agents.defaults configuration");
      }
      if (!Array.isArray(configData.agents.list)) {
        issues.push("agents.list must be an array");
      } else {
        for (let i = 0; i < configData.agents.list.length; i++) {
          const agent = configData.agents.list[i];
          if (!agent.id) issues.push(`agents.list[${i}]: missing id`);
          if (!agent.name) issues.push(`agents.list[${i}]: missing name`);
          if (!agent.workspace)
            issues.push(`agents.list[${i}]: missing workspace`);
        }
      }
    }

    if (!configData.bindings) {
      issues.push("Missing recommended field: bindings");
    }

    if (!configData.skills) {
      issues.push("Missing recommended field: skills");
    }

    return { data: { valid: issues.length === 0, issues } };
  });
};

// Export internal helpers for use by other main-process modules.
// decryptApiKey is NEVER exposed via IPC — it is only for main-process use.
module.exports.decryptApiKey = decryptApiKey;

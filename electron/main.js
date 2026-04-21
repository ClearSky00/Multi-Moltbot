"use strict";

require("dotenv").config();

const { app, BrowserWindow, session, ipcMain } = require("electron");
const path = require("path");
const gatewayBridge = require("./ipc/gatewayBridge");
const { loadGatewayToken } = require("./services/gatewayToken");
const {
  registerProtocol,
  handleDeepLink,
} = require("./services/protocolHandler");

// MUST be called before app.whenReady()
app.disableHardwareAcceleration();

// Register custom deep-link protocol — MUST be before app.whenReady()
registerProtocol();

// Enforce single-instance lock (required for deep-link handling on Windows/Linux)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow = null;
const isDev = !app.isPackaged;

/**
 * Use IPv4 loopback when the URL says "localhost" so we reach servers bound to
 * 127.0.0.1 (e.g. mock gateway). On many systems "localhost" resolves to ::1 first.
 */
function normalizeGatewayLoopbackUrl(url) {
  if (!url || typeof url !== "string") return url;
  return url
    .replace(/^ws:\/\/localhost\b/i, "ws://127.0.0.1")
    .replace(/^wss:\/\/localhost\b/i, "wss://127.0.0.1");
}

/**
 * WebSocket URL for the OpenClaw Gateway:
 * 1) Value saved in Settings (electron-store) — so the UI URL matches the socket.
 * 2) OPENCLAW_GATEWAY_URL when nothing is persisted (CI, first run, headless).
 * 3) Default loopback port.
 *
 * Note: We do not put gateway_* in store defaults so .env can apply until the user saves from Settings.
 */
async function resolveGatewayUrl() {
  try {
    const { default: Store } = await import("electron-store");
    const s = new Store({ name: "hivemind-settings" });
    const stored = s.get("gateway_url") || s.get("gatewayUrl");
    if (typeof stored === "string" && stored.trim()) {
      return normalizeGatewayLoopbackUrl(stored.trim());
    }
  } catch (err) {
    console.warn("[HiveMind] resolveGatewayUrl:", err.message);
  }
  const envUrl = process.env.OPENCLAW_GATEWAY_URL;
  if (envUrl && String(envUrl).trim()) {
    return normalizeGatewayLoopbackUrl(String(envUrl).trim());
  }
  return "ws://127.0.0.1:18789";
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    frame: false,
    transparent: false,
    backgroundColor: "#FFFFFF",
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 16, y: 12 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: !isDev,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      devTools: isDev,
    },
  });

  // Content Security Policy — relaxed in dev to allow Vite HMR
  mainWindow.webContents.session.webRequest.onHeadersReceived(
    (details, callback) => {
      if (isDev) {
        // In dev mode, don't set restrictive CSP so Vite HMR works
        callback({ responseHeaders: details.responseHeaders });
        return;
      }
      // Build connect-src dynamically to include the Supabase URL
      const supabaseUrl = process.env.SUPABASE_URL || "";
      const connectSources = [
        "'self'",
        "ws://127.0.0.1:18789",
        "ws://127.0.0.1:18790",
      ];
      if (supabaseUrl) {
        connectSources.push(supabaseUrl);
      }

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            [
              "default-src 'self'",
              "script-src 'self'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https://*.supabase.co",
              `connect-src ${connectSources.join(" ")}`,
            ].join("; "),
          ],
        },
      });
    },
  );

  // Prevent navigation to external URLs
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const parsedUrl = new URL(url);
    const allowedOrigins = ["http://localhost:5173", "file://"];
    const isAllowed = allowedOrigins.some((origin) => url.startsWith(origin));
    if (!isAllowed) {
      event.preventDefault();
    }
  });

  // Prevent new window creation
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  });

  // When the user restarts the gateway from a terminal (`openclaw gateway restart`),
  // refocus the app to retry immediately instead of waiting on backoff alone.
  let lastGatewayFocusReconnectAt = 0;
  mainWindow.on("focus", () => {
    const now = Date.now();
    if (now - lastGatewayFocusReconnectAt < 4000) return;
    if (
      gatewayBridge.isConnected ||
      !gatewayBridge.shouldReconnect ||
      !gatewayBridge._url
    )
      return;
    lastGatewayFocusReconnectAt = now;
    gatewayBridge.reconnectDelay = 1000;
    loadGatewayToken()
      .then((tok) => {
        gatewayBridge.setConnectToken(tok);
        gatewayBridge.connect(gatewayBridge._url);
      })
      .catch(() => gatewayBridge.connect(gatewayBridge._url));
  });

  // Log renderer errors for debugging
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription) => {
      console.error(
        `[HiveMind] Page failed to load: ${errorCode} ${errorDescription}`,
      );
    },
  );

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[HiveMind] Renderer process gone:", details.reason);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

app.whenReady().then(async () => {
  const win = createWindow();

  // Initialize gateway bridge with the main window reference
  gatewayBridge.init(win);

  const gatewayUrl = await resolveGatewayUrl();
  try {
    gatewayBridge.setConnectToken(await loadGatewayToken());
  } catch (err) {
    console.warn("[HiveMind] gateway token load failed:", err.message);
    gatewayBridge.setConnectToken("");
  }
  gatewayBridge.connect(gatewayUrl);

  // Register all IPC handlers — each module receives the mainWindow reference
  require("./ipc/dbHandlers")();
  require("./ipc/agentHandlers")(win);
  require("./ipc/taskHandlers")(win);
  require("./ipc/fileSystemHandlers")(win);
  require("./ipc/skillHandlers")(win);
  require("./ipc/systemHandlers")(win);
  require("./ipc/authHandlers")(win);
  require("./ipc/providerHandlers")(win);

  // Agent workspace initialization is deferred until AFTER authentication.
  // The renderer calls 'app:init-workspaces' once the user has signed in
  // and the session has been synced to the main process.
  let workspaceInitPromise = null;
  ipcMain.handle("app:init-workspaces", async () => {
    // Guard against concurrent calls — return the in-flight promise if one exists
    if (workspaceInitPromise) return workspaceInitPromise;

    workspaceInitPromise = (async () => {
      try {
        const { getSupabase } = require("./services/supabase");
        const { ensureAllWorkspaces, writeSkillsToWorkspace } = require("./services/workspaceManager");
        const { writeConfig } = require("./services/openclawConfig");
        const { writeProviderCredentials } = require("./services/providerCredentials");

        const supabase = getSupabase();
        if (!supabase) return { error: "Supabase not configured" };

        const { fetchMergedAgents } = require("./services/agentMerge");
        const agents = await fetchMergedAgents();

        if (agents && agents.length > 0) {
          await ensureAllWorkspaces(agents);
          await writeConfig(agents);
          await writeProviderCredentials();
          console.log(
            `[HiveMind] Initialized ${agents.length} agent workspaces and openclaw.json`,
          );
        }

        // Write enabled skills from DB to disk (agent-scoped and global)
        try {
          const { data: skillRows } = await supabase
            .from("skills")
            .select("id, skill_id, agent_id, scope, skill_content, enabled")
            .eq("enabled", true);
          if (skillRows?.length) {
            await writeSkillsToWorkspace(skillRows);
          }
        } catch (err) {
          console.warn("[HiveMind] skill sync skipped:", err.message);
        }

        return { data: { initialized: true, agentCount: agents?.length || 0 } };
      } catch (err) {
        console.warn("[HiveMind] Workspace init failed:", err.message);
        return { error: err.message };
      } finally {
        workspaceInitPromise = null;
      }
    })();

    return workspaceInitPromise;
  });

  // Expose gateway bridge operations via IPC
  ipcMain.handle("gateway:status", () => {
    return {
      connected: gatewayBridge.isConnected,
      pendingRequests: gatewayBridge.pendingRequests.size,
    };
  });

  ipcMain.handle(
    "gateway:send",
    async (_event, { method, params, timeout }) => {
      return gatewayBridge.request(method, params, timeout);
    },
  );

  ipcMain.handle("gateway:connect", async (_event, { url } = {}) => {
    const explicit = url && String(url).trim();
    const raw = explicit || (await resolveGatewayUrl());
    const targetUrl = normalizeGatewayLoopbackUrl(raw);
    try {
      gatewayBridge.setConnectToken(await loadGatewayToken());
    } catch (err) {
      console.warn("[HiveMind] gateway token load failed:", err.message);
      gatewayBridge.setConnectToken("");
    }
    gatewayBridge.disconnect();
    gatewayBridge.shouldReconnect = true;
    gatewayBridge.connect(targetUrl);
    try {
      await gatewayBridge.waitUntilHandshake(15000);
    } catch (err) {
      return {
        ok: false,
        error: err?.message || "Gateway handshake failed",
        url: targetUrl,
      };
    }
    return { ok: true, url: targetUrl };
  });

  ipcMain.handle("gateway:disconnect", () => {
    gatewayBridge.disconnect();
    return { ok: true };
  });

  // Checkpoint response — forward approval/rejection to gateway
  ipcMain.handle(
    "checkpoint:respond",
    async (_event, { checkpointId, approved, reason }) => {
      const result = await gatewayBridge.request("checkpoint.respond", {
        checkpointId,
        approved,
        reason: reason || "",
      });
      return result;
    },
  );
});

// Deep link handling — macOS
app.on("open-url", (event, url) => {
  event.preventDefault();
  if (mainWindow) {
    handleDeepLink(url, mainWindow);
  }
});

// Deep link handling — Windows / Linux (second-instance receives the argv)
app.on("second-instance", (_event, argv) => {
  // On Windows/Linux the deep-link URL is the last argv element
  const deepLinkUrl = argv.find((arg) => arg.startsWith("hivemind-os://"));
  if (deepLinkUrl && mainWindow) {
    handleDeepLink(deepLinkUrl, mainWindow);
  }
});

app.on("window-all-closed", () => {
  gatewayBridge.disconnect();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const win = createWindow();
    gatewayBridge.init(win);
    resolveGatewayUrl().then(async (u) => {
      try {
        gatewayBridge.setConnectToken(await loadGatewayToken());
      } catch (err) {
        console.warn("[HiveMind] gateway token load failed:", err.message);
        gatewayBridge.setConnectToken("");
      }
      gatewayBridge.connect(u);
    });
  }
});

// Note: app.disableHardwareAcceleration() is called at the top of the file (before app.whenReady)

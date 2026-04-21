"use strict";

const path = require("path");
const {
  ipcMain,
  shell,
  safeStorage,
  BrowserWindow,
  BrowserView,
} = require("electron");
const { parseDeepLink } = require("../services/protocolHandler");
const secureTokenStorage = require("../services/secureTokenStorage");
const { setUserSession, clearUserSession } = require("../services/supabase");

/** @type {Electron.BrowserWindow|null} */
let activeOAuthPopup = null;

/**
 * Register all auth:* IPC handlers.
 * @param {Electron.BrowserWindow} mainWindow
 */
module.exports = function registerAuthHandlers(mainWindow) {
  // =========================================================================
  // CUSTOM STORAGE ADAPTER — used by renderer's Supabase client
  // These 3 channels implement the getItem/setItem/removeItem interface
  // that the Supabase JS client needs for its custom storage option.
  // =========================================================================

  ipcMain.handle("auth:storage:get", async (_event, { key }) => {
    if (!key) return { data: null };
    try {
      const value = await secureTokenStorage.getItem(key);
      return { data: value };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle("auth:storage:set", async (_event, { key, value }) => {
    if (!key) return { error: "key is required" };
    try {
      await secureTokenStorage.setItem(key, value);
      return { data: { saved: true } };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle("auth:storage:remove", async (_event, { key }) => {
    if (!key) return { error: "key is required" };
    try {
      await secureTokenStorage.removeItem(key);
      return { data: { removed: true } };
    } catch (err) {
      return { error: err.message };
    }
  });

  // =========================================================================
  // SESSION PERSISTENCE — high-level session save/load/clear
  // =========================================================================

  ipcMain.handle("auth:get-session", async () => {
    try {
      const session = await secureTokenStorage.loadSession();
      return { data: session };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle("auth:save-session", async (_event, { session }) => {
    if (!session) return { error: "session object is required" };
    try {
      await secureTokenStorage.saveSession(session);
      return { data: { saved: true } };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle("auth:clear-session", async () => {
    try {
      await secureTokenStorage.clearSession();
      return { data: { cleared: true } };
    } catch (err) {
      return { error: err.message };
    }
  });

  // =========================================================================
  // SESSION SYNC — bridge renderer auth to main-process Supabase client
  //
  // When the renderer authenticates (sign-in, token refresh), it sends the
  // access token here. The main-process Supabase client is recreated with
  // the JWT in its Authorization header so all DB operations pass RLS.
  // =========================================================================

  ipcMain.handle("auth:sync-session", async (_event, { accessToken }) => {
    if (!accessToken) {
      return { error: "accessToken is required" };
    }
    try {
      setUserSession(accessToken);
      console.log("[Auth] Session synced to main process");
      return { data: { synced: true } };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle("auth:clear-main-session", async () => {
    try {
      clearUserSession();
      await secureTokenStorage.clearSession();
      console.log("[Auth] Main-process session cleared");
      return { data: { cleared: true } };
    } catch (err) {
      return { error: err.message };
    }
  });

  // =========================================================================
  // SUPABASE CONFIG — provide URL + anon key to renderer
  // =========================================================================

  ipcMain.handle("auth:get-supabase-config", async () => {
    // Primary path: environment variables (set via .env in dev, or by a previous
    // reconfigure() call this session).
    const envUrl = process.env.SUPABASE_URL;
    const envKey = process.env.SUPABASE_ANON_KEY;
    if (envUrl && envKey) {
      return { data: { url: envUrl, anonKey: envKey } };
    }

    // Fallback path: credentials saved via the onboarding UI.
    // The onboarding stores the URL in electron-store ("hivemind-settings")
    // and the anon key encrypted in safeStorage ("hivemind-keys").
    try {
      const { default: Store } = await import("electron-store");

      const settingsStore = new Store({ name: "hivemind-settings" });
      const savedUrl = settingsStore.get("supabase_url");

      if (!savedUrl) {
        return {
          error: "Supabase is not configured. Complete onboarding first.",
        };
      }

      if (!safeStorage.isEncryptionAvailable()) {
        return {
          error:
            "OS encryption is not available — cannot read Supabase credentials.",
        };
      }

      const keyStore = new Store({ name: "hivemind-keys" });
      const base64 = keyStore.get("apiKeys.supabase_anon");
      if (!base64) {
        return {
          error: "Supabase anon key not found. Complete onboarding first.",
        };
      }

      const savedAnonKey = safeStorage.decryptString(
        Buffer.from(base64, "base64"),
      );

      // Promote to process.env so that downstream handlers (auth:open-external
      // host check, setUserSession, etc.) work without re-reading storage.
      process.env.SUPABASE_URL = savedUrl;
      process.env.SUPABASE_ANON_KEY = savedAnonKey;

      return { data: { url: savedUrl, anonKey: savedAnonKey } };
    } catch (err) {
      return { error: `Failed to load Supabase config: ${err.message}` };
    }
  });

  // =========================================================================
  // OPEN EXTERNAL — open OAuth URLs in system browser
  //
  // In Electron the will-navigate handler blocks external URLs, so OAuth
  // must use skipBrowserRedirect:true and open the URL via shell.openExternal.
  // Only Supabase auth URLs are allowed to prevent open-redirect abuse.
  // =========================================================================

  ipcMain.handle("auth:open-external", async (_event, { url }) => {
    if (!url) return { error: "url is required" };

    try {
      const parsed = new URL(url);

      // Only allow Supabase auth URLs and well-known OAuth providers.
      // supabaseHost covers custom domains; the .supabase.co pattern covers
      // cloud projects when SUPABASE_URL isn't available in process.env
      // (e.g. credentials stored only in safeStorage after onboarding).
      const supabaseUrl = process.env.SUPABASE_URL || "";
      const supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : null;
      const allowedHosts = [
        supabaseHost,
        "accounts.google.com",
        "github.com",
      ].filter(Boolean);

      const isSupabaseCloud = parsed.hostname.endsWith(".supabase.co");
      if (!isSupabaseCloud && !allowedHosts.includes(parsed.host)) {
        return {
          error: `Blocked: ${parsed.host} is not an allowed OAuth host`,
        };
      }

      await shell.openExternal(url);
      return { data: { opened: true } };
    } catch (err) {
      return { error: err.message };
    }
  });

  // =========================================================================
  // OAUTH POPUP — open an in-app BrowserWindow for OAuth instead of the
  // system browser. Intercepts the hivemind-os:// redirect before the OS
  // handles it, extracts the PKCE code, and returns it to the renderer.
  //
  // modal:false so the user can return to the auth screen and dismiss via
  // auth:cancel-oauth-popup (or the pop-up's own close control / Escape).
  // =========================================================================

  ipcMain.handle("auth:cancel-oauth-popup", () => {
    try {
      const win = activeOAuthPopup;
      if (win && !win.isDestroyed()) {
        win.close();
      }
      return { data: { ok: true } };
    } catch (err) {
      return { error: err.message };
    }
  });

  // Close control on the OAuth window chrome (oauth-shell.html), not the HiveMind preload.
  ipcMain.handle("oauth-shell:close", (event) => {
    try {
      if (!activeOAuthPopup || activeOAuthPopup.isDestroyed()) {
        return { data: { ok: false } };
      }
      if (event.sender !== activeOAuthPopup.webContents) {
        return { data: { ok: false } };
      }
      activeOAuthPopup.close();
      return { data: { ok: true } };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle("auth:open-oauth-popup", (_event, { url }) => {
    if (!url) return Promise.resolve({ error: "url is required" });

    // Validate the URL is an allowed OAuth origin
    try {
      const parsed = new URL(url);
      const supabaseUrl = process.env.SUPABASE_URL || "";
      const supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : null;
      const allowedHosts = [
        supabaseHost,
        "accounts.google.com",
        "github.com",
      ].filter(Boolean);
      const isSupabaseCloud = parsed.hostname.endsWith(".supabase.co");
      if (!isSupabaseCloud && !allowedHosts.includes(parsed.host)) {
        return Promise.resolve({
          error: `Blocked: ${parsed.host} is not an allowed OAuth host`,
        });
      }
    } catch (err) {
      return Promise.resolve({ error: `Invalid URL: ${err.message}` });
    }

    if (activeOAuthPopup && !activeOAuthPopup.isDestroyed()) {
      activeOAuthPopup.close();
    }

    return new Promise((resolve) => {
      const TOOLBAR_HEIGHT = 44;
      const shellPreload = path.join(__dirname, "..", "oauthShellPreload.js");
      const shellHtml = path.join(__dirname, "..", "oauth-shell.html");

      // Provider pages (GitHub, Google) fill the view; OS window chrome is often hidden
      // or easy to miss. A fixed shell bar + BrowserView keeps a visible × at all times.
      const oauthView = new BrowserView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      const popup = new BrowserWindow({
        width: 520,
        height: 760,
        parent: mainWindow,
        modal: false,
        frame: false,
        title: "Sign in",
        backgroundColor: "#f8f8f7",
        show: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        webPreferences: {
          preload: shellPreload,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      activeOAuthPopup = popup;

      const clearPopupRef = () => {
        if (activeOAuthPopup === popup) activeOAuthPopup = null;
      };

      const layoutView = () => {
        if (popup.isDestroyed()) return;
        const [w, h] = popup.getContentSize();
        oauthView.setBounds({
          x: 0,
          y: TOOLBAR_HEIGHT,
          width: w,
          height: Math.max(0, h - TOOLBAR_HEIGHT),
        });
      };

      popup.setBrowserView(oauthView);
      layoutView();
      popup.on("resize", layoutView);

      popup.setMenuBarVisibility(false);

      void (async () => {
        try {
          await popup.loadFile(shellHtml);
        } catch (err) {
          console.error(
            "[authHandlers] OAuth shell failed to load:",
            err.message,
          );
        }
        if (popup.isDestroyed()) return;
        oauthView.webContents.loadURL(url);
        popup.show();
      })();

      oauthView.webContents.on("before-input-event", (event, input) => {
        if (input.type === "keyDown" && input.key === "Escape") {
          event.preventDefault();
          if (!popup.isDestroyed()) popup.close();
        }
      });

      let resolved = false;

      const finish = (deepLinkUrl) => {
        if (resolved) return;
        resolved = true;
        clearPopupRef();
        try {
          if (!popup.isDestroyed()) popup.setBrowserView(null);
        } catch (_) {
          /* ignore */
        }
        const parsed = parseDeepLink(deepLinkUrl);
        if (!popup.isDestroyed()) popup.destroy();
        resolve({ data: parsed || { params: {} } });
      };

      oauthView.webContents.on("will-navigate", (event, navUrl) => {
        if (navUrl.startsWith("hivemind-os://")) {
          event.preventDefault();
          finish(navUrl);
        }
      });

      oauthView.webContents.on("will-redirect", (event, navUrl) => {
        if (navUrl.startsWith("hivemind-os://")) {
          event.preventDefault();
          finish(navUrl);
        }
      });

      popup.on("closed", () => {
        clearPopupRef();
        if (!resolved) {
          resolved = true;
          resolve({ data: { cancelled: true, params: {} } });
        }
      });
    });
  });
};

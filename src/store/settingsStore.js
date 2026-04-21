import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import * as db from "../services/db";
import * as openclaw from "../services/openclaw";

/**
 * Settings Store — manages user settings, API key status, and app config.
 *
 * Settings are persisted via the db service (db:getSetting / db:setSetting).
 * API key operations go through openclaw service for secure storage.
 */
const useSettingsStore = create(
  subscribeWithSelector((set, get) => ({
    // ---- State ----
    settings: {},
    isLoaded: false,

    // ---- Actions ----

    /**
     * Load all settings from the database.
     */
    fetchSettings: async () => {
      try {
        const result = await openclaw.getSettings();
        const data = result?.data;
        if (data && typeof data === "object") {
          set({ settings: data, isLoaded: true });
        } else {
          set({ isLoaded: true });
        }
      } catch (err) {
        console.error("[SettingsStore] fetchSettings failed:", err);
        set({ isLoaded: true });
      }
    },

    /**
     * Update a single setting by key and persist it.
     */
    updateSetting: async (key, value) => {
      set((state) => ({
        settings: {
          ...state.settings,
          [key]: value,
        },
      }));
      try {
        await db.setSetting(key, value);
      } catch (err) {
        console.error(`[SettingsStore] updateSetting("${key}") failed:`, err);
        throw err;
      }
    },

    /**
     * Get the status of a specific API key by provider name.
     * Returns { exists: boolean, provider: string } or null on error.
     */
    getApiKeyStatus: async (provider) => {
      try {
        const result = await openclaw.getApiKey({ provider });
        return {
          exists: result?.data?.exists === true,
          provider,
        };
      } catch (err) {
        console.error(
          `[SettingsStore] getApiKeyStatus("${provider}") failed:`,
          err,
        );
        return { exists: false, provider };
      }
    },

    /**
     * Save an API key for a provider using secure storage.
     */
    saveApiKey: async (provider, key) => {
      try {
        await openclaw.saveApiKey({ provider, key });
        set((state) => ({
          settings: {
            ...state.settings,
            [`apiKey_${provider}_exists`]: true,
          },
        }));
      } catch (err) {
        console.error(`[SettingsStore] saveApiKey("${provider}") failed:`, err);
        throw err;
      }
    },

    /**
     * Delete an API key for a provider.
     */
    deleteApiKey: async (provider) => {
      try {
        await openclaw.deleteApiKey({ provider });
        set((state) => ({
          settings: {
            ...state.settings,
            [`apiKey_${provider}_exists`]: false,
          },
        }));
      } catch (err) {
        console.error(
          `[SettingsStore] deleteApiKey("${provider}") failed:`,
          err,
        );
        throw err;
      }
    },

    /**
     * Get a single setting value by key with optional default.
     */
    getSetting: (key, defaultValue = null) => {
      return get().settings[key] ?? defaultValue;
    },
  })),
);

export { useSettingsStore };
export default useSettingsStore;

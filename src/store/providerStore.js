import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import * as providerService from "../services/providerService";

/**
 * Provider Store — manages model provider configurations.
 *
 * Providers are keyed by ID in a map for O(1) lookup.
 * API keys are never stored here — only masked status from the main process.
 */
const useProviderStore = create(
  subscribeWithSelector((set, get) => ({
    // ---- State ----
    providers: {},        // { [id]: Provider }
    defaultId: null,      // id of the default provider
    isLoaded: false,
    loadError: null,

    // ---- Actions ----

    /**
     * Load all providers from the main process.
     */
    fetchProviders: async () => {
      try {
        const result = await providerService.listProviders();
        if (result?.error) {
          set({ loadError: result.error, isLoaded: true });
          return;
        }
        const { providers = [], defaultId = null } = result?.data ?? {};
        const providerMap = {};
        for (const p of providers) {
          providerMap[p.id] = p;
        }
        set({ providers: providerMap, defaultId, isLoaded: true, loadError: null });
      } catch (err) {
        set({ loadError: err.message, isLoaded: true });
      }
    },

    /**
     * Create or update a provider. Optimistically updates local state.
     */
    upsertProvider: async (provider) => {
      const result = await providerService.upsertProvider(provider);
      if (result?.error) throw new Error(result.error);
      const updated = result.data.provider;
      set((state) => ({
        providers: { ...state.providers, [updated.id]: { ...state.providers[updated.id], ...updated } },
        defaultId: state.defaultId || updated.id,
      }));
      return updated;
    },

    /**
     * Delete a provider and its key.
     */
    deleteProvider: async (id) => {
      const result = await providerService.deleteProvider(id);
      if (result?.error) throw new Error(result.error);
      set((state) => {
        const { [id]: _removed, ...rest } = state.providers;
        const newDefaultId =
          state.defaultId === id
            ? Object.keys(rest)[0] ?? null
            : state.defaultId;
        return { providers: rest, defaultId: newDefaultId };
      });
    },

    /**
     * Set a provider as the default.
     */
    setDefault: async (id) => {
      // Persist via upsert with isDefault flag
      const state = get();
      const provider = state.providers[id];
      if (!provider) throw new Error(`Provider "${id}" not found`);

      // Clear old default, set new default
      const updates = {};
      for (const [pid, p] of Object.entries(state.providers)) {
        updates[pid] = { ...p, isDefault: pid === id };
      }

      await providerService.upsertProvider({ ...provider, isDefault: true });
      set({ providers: updates, defaultId: id });
    },

    /**
     * Save an API key for a provider. Returns the masked version.
     */
    saveKey: async (id, key) => {
      const result = await providerService.saveProviderKey(id, key);
      if (result?.error) throw new Error(result.error);
      const { masked } = result.data;
      set((state) => ({
        providers: {
          ...state.providers,
          [id]: {
            ...state.providers[id],
            keyStatus: { exists: true, masked },
          },
        },
      }));
      return masked;
    },

    /**
     * Delete the API key for a provider.
     */
    deleteKey: async (id) => {
      const result = await providerService.deleteProviderKey(id);
      if (result?.error) throw new Error(result.error);
      set((state) => ({
        providers: {
          ...state.providers,
          [id]: {
            ...state.providers[id],
            keyStatus: { exists: false, masked: null },
          },
        },
      }));
    },

    /**
     * Test connectivity for a provider. Returns { ok, latencyMs, error? }.
     */
    testConnection: async (id) => {
      const result = await providerService.testProviderConnection(id);
      if (result?.error) throw new Error(result.error);
      return result.data;
    },

    /**
     * Fetch available models for a provider and cache them in state.
     * Returns array of LiteLLM-format model strings.
     */
    fetchModels: async (id) => {
      const result = await providerService.fetchProviderModels(id);
      if (result?.error) throw new Error(result.error);
      const { models } = result.data;
      set((state) => ({
        providers: {
          ...state.providers,
          [id]: { ...state.providers[id], models },
        },
      }));
      return models;
    },

    // ---- Computed helpers ----

    /** Returns all enabled providers as an array, sorted by name. */
    getEnabledProviders: () => {
      return Object.values(get().providers)
        .filter((p) => p.enabled)
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    /** Returns the default provider object, or null. */
    getDefaultProvider: () => {
      const { providers, defaultId } = get();
      return defaultId ? providers[defaultId] ?? null : null;
    },

    /**
     * Returns all available model strings across all enabled providers.
     * Format: LiteLLM strings like "ollama/gemma4:e4b", "gemini/gemini-2.0-flash".
     */
    getAvailableModels: () => {
      return Object.values(get().providers)
        .filter((p) => p.enabled && p.models?.length > 0)
        .flatMap((p) => p.models);
    },

    /**
     * Returns models grouped by provider for use in dropdowns.
     * [ { provider: Provider, models: string[] }, ... ]
     */
    getModelsByProvider: () => {
      return Object.values(get().providers)
        .filter((p) => p.enabled && p.models?.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ provider: p, models: p.models }));
    },
  })),
);

export { useProviderStore };
export default useProviderStore;

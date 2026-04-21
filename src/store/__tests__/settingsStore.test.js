import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSettingsStore } from "../settingsStore";

vi.mock("../../services/db", () => ({
  setSetting: vi.fn(),
}));

vi.mock("../../services/openclaw", () => ({
  getSettings: vi.fn(),
  getApiKey: vi.fn(),
  saveApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
}));

const db = await import("../../services/db");
const openclaw = await import("../../services/openclaw");

const initialState = {
  settings: {},
  isLoaded: false,
};

describe("settingsStore", () => {
  beforeEach(() => {
    useSettingsStore.setState(initialState);
    vi.clearAllMocks();
  });

  // -------------------------------------------------------
  it("initializes with isLoaded false", () => {
    const state = useSettingsStore.getState();
    expect(state.isLoaded).toBe(false);
    expect(state.settings).toEqual({});
  });

  // -------------------------------------------------------
  it("fetchSettings loads from DB", async () => {
    const mockSettings = {
      theme: "dark",
      language: "en",
      autoSave: true,
      maxConcurrentAgents: 5,
    };
    openclaw.getSettings.mockResolvedValueOnce({ data: mockSettings });

    await useSettingsStore.getState().fetchSettings();

    const state = useSettingsStore.getState();
    expect(state.isLoaded).toBe(true);
    expect(state.settings).toEqual(mockSettings);
    expect(state.settings.theme).toBe("dark");
    expect(state.settings.language).toBe("en");
    expect(state.settings.autoSave).toBe(true);
    expect(state.settings.maxConcurrentAgents).toBe(5);
    expect(openclaw.getSettings).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------
  it("updateSetting calls db and updates local", async () => {
    useSettingsStore.setState({
      settings: { theme: "dark", language: "en" },
      isLoaded: true,
    });
    db.setSetting.mockResolvedValueOnce(undefined);

    await useSettingsStore.getState().updateSetting("theme", "light");

    const state = useSettingsStore.getState();
    expect(state.settings.theme).toBe("light");
    // Other settings preserved
    expect(state.settings.language).toBe("en");
    expect(db.setSetting).toHaveBeenCalledWith("theme", "light");
    expect(db.setSetting).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------
  it("handles fetch error gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    openclaw.getSettings.mockRejectedValueOnce(new Error("Network timeout"));

    await useSettingsStore.getState().fetchSettings();

    const state = useSettingsStore.getState();
    // isLoaded should still be set to true even on error
    expect(state.isLoaded).toBe(true);
    // settings should remain empty (no crash)
    expect(state.settings).toEqual({});
    expect(consoleSpy).toHaveBeenCalledWith(
      "[SettingsStore] fetchSettings failed:",
      expect.any(Error),
    );
  });
});

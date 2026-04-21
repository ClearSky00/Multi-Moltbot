import "@testing-library/jest-dom/vitest";

// Global mock for the Electron IPC bridge exposed on window.hivemind.
// Guard against node environment where window is not defined (electron tests).
if (typeof window !== "undefined") {
  beforeEach(() => {
    window.hivemind = {
      invoke: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockReturnValue(() => {}),
      once: vi.fn(),
      platform: "win32",
      version: "0.1.0",
    };
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

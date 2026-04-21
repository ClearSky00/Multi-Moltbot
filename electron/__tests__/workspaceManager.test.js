/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";

const require_ = createRequire(import.meta.url);
const pathUtilsPath = require_.resolve("../../electron/services/pathUtils.js");
const workspaceManagerPath = require_.resolve(
  "../../electron/services/workspaceManager.js",
);

describe("workspaceManager", () => {
  let ensureWorkspace, ensureAllWorkspaces, validateWorkspace, writeSkillsToWorkspace;
  let mockFsPromises;
  let mockSafeReadFile, mockSafeWriteFile, mockIsWithinOpenClaw;

  beforeEach(() => {
    // Clear module caches
    delete require_.cache[workspaceManagerPath];
    Object.keys(require_.cache).forEach((key) => {
      if (key.includes("workspaceManager")) delete require_.cache[key];
    });

    // Create fs.promises mock
    mockFsPromises = {
      mkdir: vi.fn(() => Promise.resolve()),
      readFile: vi.fn(() => Promise.resolve("content")),
      writeFile: vi.fn(() => Promise.resolve()),
    };
    require_.cache["fs"] = {
      id: "fs",
      filename: "fs",
      loaded: true,
      exports: { promises: mockFsPromises },
    };

    // Create pathUtils mock
    mockSafeReadFile = vi.fn(() => Promise.resolve(null));
    mockSafeWriteFile = vi.fn(() => Promise.resolve());
    mockIsWithinOpenClaw = vi.fn(() => true);

    require_.cache[pathUtilsPath] = {
      id: pathUtilsPath,
      filename: pathUtilsPath,
      loaded: true,
      exports: {
        getOpenClawBase: vi.fn(() => "/test/.openclaw"),
        getWorkspacePath: vi.fn((id) => `/test/.openclaw/workspace-${id}`),
        getAgentDir: vi.fn((id) => `/test/.openclaw/agents/${id}`),
        isWithinOpenClaw: mockIsWithinOpenClaw,
        safeReadFile: mockSafeReadFile,
        safeWriteFile: mockSafeWriteFile,
      },
    };

    // Load module under test
    const mod = require_(workspaceManagerPath);
    ensureWorkspace = mod.ensureWorkspace;
    ensureAllWorkspaces = mod.ensureAllWorkspaces;
    validateWorkspace = mod.validateWorkspace;
    writeSkillsToWorkspace = mod.writeSkillsToWorkspace;
  });

  afterEach(() => {
    delete require_.cache["fs"];
    delete require_.cache[pathUtilsPath];
    delete require_.cache[workspaceManagerPath];
  });

  // ==========================================================================
  // ensureWorkspace
  // ==========================================================================

  it("creates workspace directory and subdirectories", async () => {
    await ensureWorkspace("coder", { name: "Coder", role: "Engineering" });

    // workspace dir, memory dir, skills dir, sessions dir
    expect(mockFsPromises.mkdir).toHaveBeenCalledTimes(4);
    expect(mockFsPromises.mkdir).toHaveBeenCalledWith(
      expect.stringContaining("workspace-coder"),
      { recursive: true },
    );
    expect(mockFsPromises.mkdir).toHaveBeenCalledWith(
      expect.stringContaining("memory"),
      { recursive: true },
    );
    expect(mockFsPromises.mkdir).toHaveBeenCalledWith(
      expect.stringContaining("skills"),
      { recursive: true },
    );
    expect(mockFsPromises.mkdir).toHaveBeenCalledWith(
      expect.stringContaining("sessions"),
      { recursive: true },
    );
  });

  it("creates all 7 required workspace files when none exist", async () => {
    const result = await ensureWorkspace("coder", {
      name: "Coder",
      role: "Engineering",
    });

    expect(mockSafeWriteFile).toHaveBeenCalledTimes(7);
    expect(result.files).toEqual(
      expect.arrayContaining([
        "SOUL.md",
        "AGENTS.md",
        "USER.md",
        "IDENTITY.md",
        "TOOLS.md",
        "HEARTBEAT.md",
        "MEMORY.md",
      ]),
    );
    expect(result.created).toBe(true);
  });

  it("uses soul_content from agent data for SOUL.md", async () => {
    await ensureWorkspace("coder", {
      name: "Coder",
      soul_content: "# Custom Soul Content",
    });

    const soulCall = mockSafeWriteFile.mock.calls.find((c) =>
      c[0].includes("SOUL.md"),
    );
    expect(soulCall).toBeDefined();
    expect(soulCall[1]).toBe("# Custom Soul Content");
  });

  it("uses agents_content from agent data for AGENTS.md", async () => {
    await ensureWorkspace("coder", {
      name: "Coder",
      agents_content: "# Custom Agents Instructions",
    });

    const agentsCall = mockSafeWriteFile.mock.calls.find((c) =>
      c[0].includes("AGENTS.md"),
    );
    expect(agentsCall).toBeDefined();
    expect(agentsCall[1]).toBe("# Custom Agents Instructions");
  });

  it("generates default SOUL.md when no soul_content provided", async () => {
    await ensureWorkspace("coder", { name: "Coder", role: "Engineering" });

    const soulCall = mockSafeWriteFile.mock.calls.find((c) =>
      c[0].includes("SOUL.md"),
    );
    expect(soulCall[1]).toContain("# Coder");
    expect(soulCall[1]).toContain("Engineering");
  });

  it("does not overwrite existing files", async () => {
    mockSafeReadFile.mockResolvedValue("existing content");

    const result = await ensureWorkspace("coder", { name: "Coder" });

    expect(mockSafeWriteFile).not.toHaveBeenCalled();
    expect(result.created).toBe(false);
    expect(result.files).toEqual([]);
  });

  it("rejects path traversal attempts", async () => {
    mockIsWithinOpenClaw.mockReturnValue(false);

    await expect(ensureWorkspace("../../../etc", {})).rejects.toThrow(
      "path traversal",
    );
  });

  it("returns workspace path in result", async () => {
    const result = await ensureWorkspace("qa", { name: "QA", role: "Testing" });

    expect(result.path).toContain("workspace-qa");
    expect(result.created).toBe(true);
  });

  // ==========================================================================
  // ensureAllWorkspaces
  // ==========================================================================

  it("processes all agents and returns summary", async () => {
    const agents = [
      { id: "orchestrator", name: "Orchestrator", role: "CEO" },
      { id: "coder", name: "Coder", role: "Engineering" },
    ];

    const result = await ensureAllWorkspaces(agents);

    expect(result.total).toBe(2);
    expect(result.created).toBe(2);
    expect(result.results).toHaveLength(2);
  });

  it("creates base OpenClaw directories (skills + credentials)", async () => {
    await ensureAllWorkspaces([]);

    expect(mockFsPromises.mkdir).toHaveBeenCalledWith(
      expect.stringContaining("skills"),
      { recursive: true },
    );
    expect(mockFsPromises.mkdir).toHaveBeenCalledWith(
      expect.stringContaining("credentials"),
      { recursive: true },
    );
  });

  it("handles errors gracefully for individual agents", async () => {
    mockIsWithinOpenClaw.mockReturnValueOnce(false).mockReturnValue(true);

    const agents = [
      { id: "../bad", name: "Bad" },
      { id: "good", name: "Good" },
    ];

    const result = await ensureAllWorkspaces(agents);
    expect(result.total).toBe(2);
    expect(result.created).toBe(1);
    expect(result.results[0].error).toBeDefined();
    expect(result.results[1].created).toBe(true);
  });

  it("works with empty agents array", async () => {
    const result = await ensureAllWorkspaces([]);
    expect(result.total).toBe(0);
    expect(result.created).toBe(0);
    expect(result.results).toEqual([]);
  });

  // ==========================================================================
  // validateWorkspace
  // ==========================================================================

  it("returns valid when all 7 files exist", async () => {
    mockSafeReadFile.mockResolvedValue("content");

    const result = await validateWorkspace("coder");
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.path).toContain("workspace-coder");
  });

  it("returns missing files when workspace is incomplete", async () => {
    mockSafeReadFile
      .mockResolvedValueOnce("content") // SOUL.md
      .mockResolvedValueOnce("content") // AGENTS.md
      .mockResolvedValueOnce("content") // USER.md
      .mockResolvedValueOnce("content") // IDENTITY.md
      .mockResolvedValueOnce("content") // TOOLS.md
      .mockResolvedValueOnce(null) // HEARTBEAT.md missing
      .mockResolvedValueOnce(null); // MEMORY.md missing

    const result = await validateWorkspace("coder");
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(["HEARTBEAT.md", "MEMORY.md"]);
  });

  it("returns all files missing for empty workspace", async () => {
    mockSafeReadFile.mockResolvedValue(null);

    const result = await validateWorkspace("new-agent");
    expect(result.valid).toBe(false);
    expect(result.missing).toHaveLength(7);
    expect(result.missing).toContain("SOUL.md");
    expect(result.missing).toContain("IDENTITY.md");
    expect(result.missing).toContain("TOOLS.md");
    expect(result.missing).toContain("MEMORY.md");
  });

  // ==========================================================================
  // writeSkillsToWorkspace — DB-driven skill materialisation
  // ==========================================================================

  it("writes agent-scoped skill content to the agent's skills directory", async () => {
    const skills = [
      {
        id: "coder:coding",
        skill_id: "coding",
        agent_id: "coder",
        scope: "agent",
        skill_content: "# Coding Skill\n\nUse bash and write_file.",
        enabled: true,
      },
    ];

    await writeSkillsToWorkspace(skills);

    expect(mockFsPromises.mkdir).toHaveBeenCalledWith(
      expect.stringContaining("workspace-coder"),
      { recursive: true },
    );
    expect(mockSafeWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("coding"),
      "# Coding Skill\n\nUse bash and write_file.",
    );
  });

  it("writes global-scoped skill content to the global skills directory", async () => {
    const skills = [
      {
        id: "search",
        skill_id: "search",
        agent_id: null,
        scope: "global",
        skill_content: "# Search Skill\n\nUse the search tool.",
        enabled: true,
      },
    ];

    await writeSkillsToWorkspace(skills);

    expect(mockFsPromises.mkdir).toHaveBeenCalledWith(
      expect.stringContaining("/skills/search"),
      { recursive: true },
    );
    expect(mockSafeWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("SKILL.md"),
      "# Search Skill\n\nUse the search tool.",
    );
  });

  it("skips skills with no skill_content", async () => {
    const skills = [
      {
        id: "coder:coding",
        skill_id: "coding",
        agent_id: "coder",
        scope: "agent",
        skill_content: null,
        enabled: true,
      },
    ];

    await writeSkillsToWorkspace(skills);

    expect(mockSafeWriteFile).not.toHaveBeenCalled();
  });

  it("skips disabled skills", async () => {
    const skills = [
      {
        id: "coder:coding",
        skill_id: "coding",
        agent_id: "coder",
        scope: "agent",
        skill_content: "# Coding Skill",
        enabled: false,
      },
    ];

    await writeSkillsToWorkspace(skills);

    expect(mockSafeWriteFile).not.toHaveBeenCalled();
  });

  it("does not overwrite an existing SKILL.md", async () => {
    mockSafeReadFile.mockResolvedValue("existing content");

    const skills = [
      {
        id: "coder:coding",
        skill_id: "coding",
        agent_id: "coder",
        scope: "agent",
        skill_content: "# New Content",
        enabled: true,
      },
    ];

    await writeSkillsToWorkspace(skills);

    expect(mockSafeWriteFile).not.toHaveBeenCalled();
  });

  it("handles multiple skills across different agents", async () => {
    const skills = [
      {
        id: "coder:coding",
        skill_id: "coding",
        agent_id: "coder",
        scope: "agent",
        skill_content: "# Coder coding skill",
        enabled: true,
      },
      {
        id: "qa:coding",
        skill_id: "coding",
        agent_id: "qa",
        scope: "agent",
        skill_content: "# QA coding skill",
        enabled: true,
      },
    ];

    await writeSkillsToWorkspace(skills);

    expect(mockSafeWriteFile).toHaveBeenCalledTimes(2);
    const calls = mockSafeWriteFile.mock.calls.map((c) => c[0]);
    expect(calls.some((p) => p.includes("workspace-coder"))).toBe(true);
    expect(calls.some((p) => p.includes("workspace-qa"))).toBe(true);
  });

  it("continues after an individual skill write error", async () => {
    mockFsPromises.mkdir
      .mockResolvedValueOnce() // first skill mkdir succeeds
      .mockRejectedValueOnce(new Error("EACCES")) // second skill mkdir fails
      .mockResolvedValue(); // subsequent calls fine

    const skills = [
      {
        id: "coder:coding",
        skill_id: "coding",
        agent_id: "coder",
        scope: "agent",
        skill_content: "# Coder",
        enabled: true,
      },
      {
        id: "qa:coding",
        skill_id: "coding",
        agent_id: "qa",
        scope: "agent",
        skill_content: "# QA",
        enabled: true,
      },
    ];

    // Should not throw even if one skill fails
    await expect(writeSkillsToWorkspace(skills)).resolves.toBeUndefined();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAgentStore } from "../agentStore";

vi.mock("../../services/db", () => ({
  listAgents: vi.fn(),
  upsertAgent: vi.fn(),
  deleteAgent: vi.fn(),
}));

vi.mock("../../services/openclaw", () => ({
  submitGoal: vi.fn(),
  cancelTask: vi.fn(),
  respondCheckpoint: vi.fn(),
}));

// Lazy imports so mocks are wired up before modules resolve
const db = await import("../../services/db");
const openclaw = await import("../../services/openclaw");

const initialState = {
  agents: {},
  customAgents: {},
  activeGoal: null,
  activeTaskId: null,
  isRunning: false,
  isStopping: false,
  activeCheckpoint: null,
  checkpointHistory: [],
  isLoading: true,
};

describe("agentStore", () => {
  beforeEach(() => {
    useAgentStore.setState(initialState);
    vi.clearAllMocks();
  });

  // -------------------------------------------------------
  it("initializes with empty agents and isLoading true", () => {
    const state = useAgentStore.getState();
    expect(state.agents).toEqual({});
    expect(state.customAgents).toEqual({});
    expect(state.isLoading).toBe(true);
    expect(state.isRunning).toBe(false);
    expect(state.activeGoal).toBeNull();
    expect(state.activeTaskId).toBeNull();
    expect(state.activeCheckpoint).toBeNull();
    expect(state.checkpointHistory).toEqual([]);
  });

  // -------------------------------------------------------
  it("fetchAgents populates agents from DB", async () => {
    const mockAgents = [
      { id: "a1", name: "Alpha", status: "idle", currentAction: null },
      { id: "a2", name: "Beta", status: "running", currentAction: "scanning" },
      { id: "a3", name: "Gamma" },
    ];
    db.listAgents.mockResolvedValueOnce({ data: mockAgents });

    await useAgentStore.getState().fetchAgents();

    const state = useAgentStore.getState();
    expect(state.isLoading).toBe(false);
    expect(Object.keys(state.agents)).toHaveLength(3);
    expect(state.agents["a1"]).toMatchObject({
      id: "a1",
      name: "Alpha",
      status: "idle",
    });
    expect(state.agents["a2"]).toMatchObject({
      id: "a2",
      status: "running",
      currentAction: "scanning",
    });
    expect(state.agents["a3"]).toMatchObject({
      id: "a3",
      status: "idle",
      currentAction: null,
    });
  });

  // -------------------------------------------------------
  it("fetchAgents handles empty response", async () => {
    db.listAgents.mockResolvedValueOnce({ data: [] });

    await useAgentStore.getState().fetchAgents();

    const state = useAgentStore.getState();
    expect(state.agents).toEqual({});
    expect(state.isLoading).toBe(false);
  });

  // -------------------------------------------------------
  it("fetchAgents handles error gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.listAgents.mockRejectedValueOnce(new Error("DB offline"));

    await useAgentStore.getState().fetchAgents();

    const state = useAgentStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.agents).toEqual({});
    expect(consoleSpy).toHaveBeenCalledWith(
      "[AgentStore] fetchAgents failed:",
      expect.any(Error),
    );
  });

  // -------------------------------------------------------
  it("updateAgentStatus updates single agent", () => {
    useAgentStore.setState({
      agents: {
        a1: { id: "a1", name: "Alpha", status: "idle", currentAction: null },
        a2: { id: "a2", name: "Beta", status: "idle", currentAction: null },
      },
    });

    useAgentStore.getState().updateAgentStatus("a1", "running", "compiling");

    const state = useAgentStore.getState();
    expect(state.agents["a1"].status).toBe("running");
    expect(state.agents["a1"].currentAction).toBe("compiling");
    // Other agents unchanged
    expect(state.agents["a2"].status).toBe("idle");
  });

  // -------------------------------------------------------
  it("submitGoal sets activeGoal and isRunning (IPC returns data.taskId)", async () => {
    openclaw.submitGoal.mockResolvedValueOnce({ data: { taskId: "t1" } });

    const result = await useAgentStore.getState().submitGoal("deploy to prod");

    const state = useAgentStore.getState();
    expect(state.activeGoal).toBe("deploy to prod");
    expect(state.isRunning).toBe(true);
    expect(state.isStopping).toBe(false);
    expect(state.activeTaskId).toBe("t1");
    expect(result).toEqual({ data: { taskId: "t1" } });
    expect(openclaw.submitGoal).toHaveBeenCalledWith({
      goal: "deploy to prod",
    });
  });

  it("submitGoal still reads legacy top-level taskId", async () => {
    openclaw.submitGoal.mockResolvedValueOnce({ taskId: "legacy" });
    await useAgentStore.getState().submitGoal("goal");
    expect(useAgentStore.getState().activeTaskId).toBe("legacy");
  });

  // -------------------------------------------------------
  it("stopAll resets agents to idle", async () => {
    useAgentStore.setState({
      agents: {
        a1: { id: "a1", status: "running", currentAction: "scanning" },
        a2: { id: "a2", status: "idle", currentAction: null },
        a3: { id: "a3", status: "running", currentAction: "writing" },
      },
      activeTaskId: "t1",
      activeGoal: "do stuff",
      isRunning: true,
    });
    openclaw.cancelTask.mockResolvedValueOnce({ data: { cancelled: true } });

    await useAgentStore.getState().stopAll();

    const state = useAgentStore.getState();
    expect(state.agents["a1"].status).toBe("idle");
    expect(state.agents["a1"].currentAction).toBeNull();
    expect(state.agents["a2"].status).toBe("idle");
    expect(state.agents["a3"].status).toBe("idle");
    expect(state.isRunning).toBe(false);
    expect(state.isStopping).toBe(false);
    expect(state.activeGoal).toBeNull();
    expect(state.activeTaskId).toBeNull();
    expect(openclaw.cancelTask).toHaveBeenCalledWith({ taskId: "t1" });
  });

  // -------------------------------------------------------
  it("triggerCheckpoint pauses running agents", () => {
    useAgentStore.setState({
      agents: {
        a1: { id: "a1", status: "running", currentAction: "scanning" },
        a2: { id: "a2", status: "idle", currentAction: null },
      },
    });

    useAgentStore.getState().triggerCheckpoint({
      checkpointId: "cp-1",
      agentId: "a1",
      action: "delete-file",
      description: "Agent wants to delete a system file",
      risk: "high",
    });

    const state = useAgentStore.getState();
    expect(state.agents["a1"].status).toBe("paused");
    expect(state.agents["a2"].status).toBe("idle");
    expect(state.activeCheckpoint).toMatchObject({
      id: "cp-1",
      agentId: "a1",
      action: "delete-file",
      risk: "high",
    });
    expect(state.activeCheckpoint.timestamp).toBeDefined();
  });

  // -------------------------------------------------------
  it("respondToCheckpoint approved resumes agents", async () => {
    useAgentStore.setState({
      agents: {
        a1: { id: "a1", status: "paused", currentAction: "scanning" },
        a2: { id: "a2", status: "idle", currentAction: null },
      },
      activeCheckpoint: {
        id: "cp-1",
        agentId: "a1",
        action: "delete-file",
        description: "deleting file",
        risk: "high",
        context: {},
        timestamp: 1000,
      },
      checkpointHistory: [],
    });
    openclaw.respondCheckpoint.mockResolvedValueOnce(undefined);

    await useAgentStore.getState().respondToCheckpoint(true, "looks good");

    const state = useAgentStore.getState();
    expect(state.agents["a1"].status).toBe("running");
    expect(state.agents["a1"].currentAction).toBe("scanning");
    expect(state.agents["a2"].status).toBe("idle");
    expect(state.activeCheckpoint).toBeNull();
    expect(state.checkpointHistory).toHaveLength(1);
    expect(state.checkpointHistory[0]).toMatchObject({
      id: "cp-1",
      approved: true,
      reason: "looks good",
    });
    expect(state.checkpointHistory[0].resolvedAt).toBeDefined();
    expect(openclaw.respondCheckpoint).toHaveBeenCalledWith({
      checkpointId: "cp-1",
      approved: true,
      reason: "looks good",
    });
  });

  // -------------------------------------------------------
  it("respondToCheckpoint rejected sets agent to error", async () => {
    useAgentStore.setState({
      agents: {
        a1: { id: "a1", status: "paused", currentAction: "scanning" },
      },
      activeCheckpoint: {
        id: "cp-2",
        agentId: "a1",
        action: "rm -rf",
        description: "dangerous",
        risk: "critical",
        context: {},
        timestamp: 2000,
      },
      checkpointHistory: [],
    });
    openclaw.respondCheckpoint.mockResolvedValueOnce(undefined);

    await useAgentStore.getState().respondToCheckpoint(false, "too risky");

    const state = useAgentStore.getState();
    expect(state.agents["a1"].status).toBe("error");
    expect(state.agents["a1"].currentAction).toBeNull();
    expect(state.activeCheckpoint).toBeNull();
    expect(state.checkpointHistory).toHaveLength(1);
    expect(state.checkpointHistory[0].approved).toBe(false);
    expect(state.checkpointHistory[0].reason).toBe("too risky");
  });

  // -------------------------------------------------------
  it("addCustomAgent adds to customAgents", async () => {
    db.upsertAgent.mockResolvedValueOnce(undefined);

    const agentDef = { id: "custom-1", name: "MyBot", model: "gpt-4" };
    await useAgentStore.getState().addCustomAgent(agentDef);

    const state = useAgentStore.getState();
    expect(state.customAgents["custom-1"]).toEqual(agentDef);
    expect(state.agents["custom-1"]).toMatchObject({
      id: "custom-1",
      name: "MyBot",
      model: "gpt-4",
      status: "idle",
      currentAction: null,
      isCustom: true,
    });
    expect(db.upsertAgent).toHaveBeenCalledWith(agentDef);
  });

  // -------------------------------------------------------
  it("removeCustomAgent removes from customAgents", async () => {
    useAgentStore.setState({
      agents: {
        a1: { id: "a1", status: "idle" },
        "custom-1": {
          id: "custom-1",
          name: "MyBot",
          status: "idle",
          isCustom: true,
        },
      },
      customAgents: {
        "custom-1": { id: "custom-1", name: "MyBot", model: "gpt-4" },
      },
    });
    db.deleteAgent.mockResolvedValueOnce(undefined);

    await useAgentStore.getState().removeCustomAgent("custom-1");

    const state = useAgentStore.getState();
    expect(state.agents["custom-1"]).toBeUndefined();
    expect(state.customAgents["custom-1"]).toBeUndefined();
    expect(state.agents["a1"]).toBeDefined();
    expect(db.deleteAgent).toHaveBeenCalledWith("custom-1");
  });
});

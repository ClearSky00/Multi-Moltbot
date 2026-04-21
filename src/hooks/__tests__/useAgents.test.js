import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAgents, useAgent, useAgentStatus } from "../useAgents";
import useAgentStore from "../../store/agentStore";

describe("useAgents", () => {
  beforeEach(() => {
    useAgentStore.setState({
      agents: {
        "agent-1": {
          id: "agent-1",
          name: "Scout",
          status: "running",
          currentAction: "scanning files",
        },
        "agent-2": {
          id: "agent-2",
          name: "Coder",
          status: "idle",
          currentAction: null,
        },
        "agent-3": {
          id: "agent-3",
          name: "Reviewer",
          status: "error",
          currentAction: null,
        },
      },
      isLoading: false,
      isRunning: true,
      activeGoal: "Refactor auth module",
      isStopping: false,
      activeCheckpoint: null,
      checkpointHistory: [],
    });
  });

  it("returns agents from store", () => {
    const { result } = renderHook(() => useAgents());

    expect(result.current.agents).toEqual(useAgentStore.getState().agents);
    expect(result.current.agentList).toHaveLength(3);
    expect(result.current.totalCount).toBe(3);
    expect(result.current.runningCount).toBe(1);
    expect(result.current.idleCount).toBe(1);
    expect(result.current.errorCount).toBe(1);
  });

  it("returns isLoading state", () => {
    useAgentStore.setState({ isLoading: true });
    const { result } = renderHook(() => useAgents());
    expect(result.current.isLoading).toBe(true);

    useAgentStore.setState({ isLoading: false });
    const { result: result2 } = renderHook(() => useAgents());
    expect(result2.current.isLoading).toBe(false);
  });

  it("returns isRunning state", () => {
    const { result } = renderHook(() => useAgents());
    expect(result.current.isRunning).toBe(true);

    useAgentStore.setState({ isRunning: false });
    const { result: result2 } = renderHook(() => useAgents());
    expect(result2.current.isRunning).toBe(false);
  });

  it("returns fetchAgents function", () => {
    const { result } = renderHook(() => useAgents());
    expect(typeof result.current.fetchAgents).toBe("function");
  });
});

describe("useAgent", () => {
  beforeEach(() => {
    useAgentStore.setState({
      agents: {
        "agent-1": {
          id: "agent-1",
          name: "Scout",
          status: "running",
          currentAction: "scanning files",
        },
        "agent-2": {
          id: "agent-2",
          name: "Coder",
          status: "idle",
          currentAction: null,
        },
      },
    });
  });

  it("returns single agent by id", () => {
    const { result } = renderHook(() => useAgent("agent-1"));
    expect(result.current).toEqual({
      id: "agent-1",
      name: "Scout",
      status: "running",
      currentAction: "scanning files",
    });
  });

  it("returns null for non-existent agent", () => {
    const { result } = renderHook(() => useAgent("agent-999"));
    expect(result.current).toBeNull();
  });
});

describe("useAgentStatus", () => {
  beforeEach(() => {
    useAgentStore.setState({
      agents: {
        "agent-1": {
          id: "agent-1",
          name: "Scout",
          status: "running",
          currentAction: "scanning files",
        },
      },
    });
  });

  it("returns status and currentAction", () => {
    const { result } = renderHook(() => useAgentStatus("agent-1"));
    expect(result.current.status).toBe("running");
    expect(result.current.currentAction).toBe("scanning files");
  });

  it("returns unknown status for non-existent agent", () => {
    const { result } = renderHook(() => useAgentStatus("agent-999"));
    expect(result.current.status).toBe("unknown");
    expect(result.current.currentAction).toBeNull();
  });
});

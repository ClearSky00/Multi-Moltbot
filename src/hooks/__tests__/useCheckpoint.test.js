import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCheckpoint } from "../useCheckpoint";
import useAgentStore from "../../store/agentStore";

describe("useCheckpoint", () => {
  beforeEach(() => {
    useAgentStore.setState({
      activeCheckpoint: null,
      checkpointHistory: [],
    });
  });

  it("returns null when no checkpoint", () => {
    const { result } = renderHook(() => useCheckpoint());
    expect(result.current.activeCheckpoint).toBeNull();
    expect(result.current.hasPending).toBe(false);
    expect(result.current.checkpointHistory).toEqual([]);
  });

  it("returns checkpoint data when pending", () => {
    const checkpoint = {
      id: "cp-1",
      agentId: "agent-1",
      action: "file_write",
      description: "Write to /etc/passwd",
      risk: "high",
      context: { path: "/etc/passwd" },
      timestamp: 1700000000000,
    };

    useAgentStore.setState({ activeCheckpoint: checkpoint });

    const { result } = renderHook(() => useCheckpoint());
    expect(result.current.activeCheckpoint).toEqual(checkpoint);
    expect(result.current.activeCheckpoint.id).toBe("cp-1");
    expect(result.current.activeCheckpoint.risk).toBe("high");
    expect(result.current.activeCheckpoint.agentId).toBe("agent-1");
  });

  it("hasPending is true with active checkpoint", () => {
    useAgentStore.setState({
      activeCheckpoint: {
        id: "cp-2",
        agentId: "agent-2",
        action: "shell_exec",
        description: "Execute rm -rf /",
        risk: "critical",
        context: {},
        timestamp: Date.now(),
      },
    });

    const { result } = renderHook(() => useCheckpoint());
    expect(result.current.hasPending).toBe(true);
  });

  it("returns respondToCheckpoint function", () => {
    const { result } = renderHook(() => useCheckpoint());
    expect(typeof result.current.respondToCheckpoint).toBe("function");
  });

  it("returns checkpointHistory from store", () => {
    const history = [
      { id: "cp-old-1", approved: true, resolvedAt: 1700000000000 },
      {
        id: "cp-old-2",
        approved: false,
        reason: "too risky",
        resolvedAt: 1700000001000,
      },
    ];
    useAgentStore.setState({ checkpointHistory: history });

    const { result } = renderHook(() => useCheckpoint());
    expect(result.current.checkpointHistory).toHaveLength(2);
    expect(result.current.checkpointHistory[0].approved).toBe(true);
    expect(result.current.checkpointHistory[1].approved).toBe(false);
  });
});

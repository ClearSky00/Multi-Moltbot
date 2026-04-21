import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useActivityFeed } from "../useActivityFeed";
import useTaskStore from "../../store/taskStore";

const testMessages = [
  {
    id: "msg-1",
    type: "security",
    content: "Checkpoint: file write to /etc/passwd",
    timestamp: 1000,
  },
  {
    id: "msg-2",
    type: "error",
    content: "Agent crashed unexpectedly",
    timestamp: 2000,
  },
  {
    id: "msg-3",
    type: "agent",
    content: "Scout started scanning",
    agentId: "agent-1",
    timestamp: 3000,
  },
  {
    id: "msg-4",
    type: "task",
    content: "Task started: Refactor auth",
    timestamp: 4000,
  },
  {
    id: "msg-5",
    type: "system",
    content: "Gateway connected",
    timestamp: 5000,
  },
  {
    id: "msg-6",
    type: "security",
    content: "Checkpoint: shell exec",
    timestamp: 6000,
  },
  { id: "msg-7", type: "error", content: "Network timeout", timestamp: 7000 },
];

describe("useActivityFeed", () => {
  beforeEach(() => {
    useTaskStore.setState({ feedMessages: testMessages });
  });

  it('returns all messages with "all" filter', () => {
    const { result } = renderHook(() => useActivityFeed("all"));
    expect(result.current.messages).toHaveLength(7);
    expect(result.current.messages).toEqual(testMessages);
    expect(result.current.totalCount).toBe(7);
  });

  it("filters security messages", () => {
    const { result } = renderHook(() => useActivityFeed("security"));
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages.every((m) => m.type === "security")).toBe(
      true,
    );
    expect(result.current.messages[0].id).toBe("msg-1");
    expect(result.current.messages[1].id).toBe("msg-6");
    // totalCount still reflects the unfiltered count
    expect(result.current.totalCount).toBe(7);
  });

  it("filters error messages", () => {
    const { result } = renderHook(() => useActivityFeed("errors"));
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages.every((m) => m.type === "error")).toBe(true);
    expect(result.current.messages[0].content).toBe(
      "Agent crashed unexpectedly",
    );
    expect(result.current.messages[1].content).toBe("Network timeout");
  });

  it("returns empty when no matches", () => {
    // Set feed to only agent messages, then filter for security
    useTaskStore.setState({
      feedMessages: [
        { id: "msg-a", type: "agent", content: "Running", timestamp: 1000 },
        {
          id: "msg-b",
          type: "agent",
          content: "Still running",
          timestamp: 2000,
        },
      ],
    });

    const { result } = renderHook(() => useActivityFeed("security"));
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.messages).toEqual([]);
    expect(result.current.totalCount).toBe(2);
  });

  it('defaults to "all" filter when no argument provided', () => {
    const { result } = renderHook(() => useActivityFeed());
    expect(result.current.messages).toHaveLength(7);
  });

  it("provides clearFeed function", () => {
    const { result } = renderHook(() => useActivityFeed());
    expect(typeof result.current.clearFeed).toBe("function");
  });
});

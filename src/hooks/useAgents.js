import { useMemo } from "react";
import { sortAgentsByPresetOrder } from "@/lib/agentDisplayOrder";
import useAgentStore from "../store/agentStore";

/**
 * useAgents — selector hook into agentStore.
 *
 * Returns the full agents map, the agent list (array), loading state,
 * and computed counts. Subscribes via Zustand selectors for minimal re-renders.
 */
export function useAgents() {
  const agents = useAgentStore((s) => s.agents);
  const isLoading = useAgentStore((s) => s.isLoading);
  const activeGoal = useAgentStore((s) => s.activeGoal);
  const isRunning = useAgentStore((s) => s.isRunning);
  const isStopping = useAgentStore((s) => s.isStopping);
  const fetchAgents = useAgentStore((s) => s.fetchAgents);
  const submitGoal = useAgentStore((s) => s.submitGoal);
  const stopAll = useAgentStore((s) => s.stopAll);

  const derived = useMemo(() => {
    const agentList = sortAgentsByPresetOrder(Object.values(agents));
    const runningCount = agentList.filter((a) => a.status === "running").length;
    const idleCount = agentList.filter((a) => a.status === "idle").length;
    const errorCount = agentList.filter((a) => a.status === "error").length;
    const pausedCount = agentList.filter((a) => a.status === "paused").length;
    const totalCount = agentList.length;

    return {
      agentList,
      runningCount,
      idleCount,
      errorCount,
      pausedCount,
      totalCount,
    };
  }, [agents]);

  return {
    agents,
    ...derived,
    isLoading,
    activeGoal,
    isRunning,
    isStopping,
    fetchAgents,
    submitGoal,
    stopAll,
  };
}

/**
 * useAgent — select a single agent by id.
 *
 * Returns the agent object or null if not found.
 */
export function useAgent(id) {
  const agent = useAgentStore((s) => s.agents[id] || null);
  return agent;
}

/**
 * useAgentStatus — select just the status of a single agent.
 *
 * Returns { status, currentAction } or { status: 'unknown', currentAction: null }.
 */
export function useAgentStatus(id) {
  const agent = useAgentStore((s) => s.agents[id]);

  return useMemo(
    () => ({
      status: agent?.status || "unknown",
      currentAction: agent?.currentAction || null,
    }),
    [agent?.status, agent?.currentAction],
  );
}

export default useAgents;

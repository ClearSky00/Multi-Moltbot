import React, { createContext, useContext, useEffect, useMemo } from "react";
import { sortAgentsByPresetOrder } from "@/lib/agentDisplayOrder";
import useAgentStore from "../store/agentStore";

/**
 * AgentContext — provides agent state derived from agentStore.
 *
 * Calls fetchAgents on mount to populate the store from the database.
 * Consumers get a reactive snapshot of agents, loading state, and
 * computed values (counts, lists) without subscribing to the raw store.
 */

const AgentContext = createContext({
  agents: {},
  agentList: [],
  isLoading: true,
  runningCount: 0,
  totalCount: 0,
  activeGoal: null,
  isRunning: false,
});

export function AgentProvider({ children }) {
  const agents = useAgentStore((s) => s.agents);
  const isLoading = useAgentStore((s) => s.isLoading);
  const activeGoal = useAgentStore((s) => s.activeGoal);
  const isRunning = useAgentStore((s) => s.isRunning);
  const fetchAgents = useAgentStore((s) => s.fetchAgents);

  // Fetch agents from DB on mount
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Derived values, memoized to avoid unnecessary re-renders
  const value = useMemo(() => {
    const agentList = sortAgentsByPresetOrder(Object.values(agents));
    const runningCount = agentList.filter((a) => a.status === "running").length;
    const totalCount = agentList.length;

    return {
      agents,
      agentList,
      isLoading,
      runningCount,
      totalCount,
      activeGoal,
      isRunning,
    };
  }, [agents, isLoading, activeGoal, isRunning]);

  return (
    <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
  );
}

/**
 * Hook to consume AgentContext.
 */
export function useAgentContext() {
  const context = useContext(AgentContext);
  if (context === undefined) {
    throw new Error("useAgentContext must be used within an AgentProvider");
  }
  return context;
}

export default AgentContext;

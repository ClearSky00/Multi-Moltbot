import useAgentStore from "../store/agentStore";

/**
 * useCheckpoint — selects activeCheckpoint + respondToCheckpoint from agentStore.
 *
 * Returns:
 *   - activeCheckpoint:    the current checkpoint awaiting review (or null)
 *   - hasPending:          boolean shorthand for activeCheckpoint !== null
 *   - respondToCheckpoint: async function(approved: boolean, reason?: string)
 *   - checkpointHistory:   array of previously resolved checkpoints
 */
export function useCheckpoint() {
  const activeCheckpoint = useAgentStore((s) => s.activeCheckpoint);
  const respondToCheckpoint = useAgentStore((s) => s.respondToCheckpoint);
  const checkpointHistory = useAgentStore((s) => s.checkpointHistory);

  return {
    activeCheckpoint,
    hasPending: activeCheckpoint !== null,
    respondToCheckpoint,
    checkpointHistory,
  };
}

export default useCheckpoint;

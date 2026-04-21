import useAgentStore from "./agentStore";

/**
 * Checkpoint Store — thin selectors over agentStore checkpoint state.
 *
 * Checkpoint state lives in agentStore (activeCheckpoint, checkpointHistory,
 * respondToCheckpoint, triggerCheckpoint). This module provides convenience
 * selectors so consumers can import checkpoint-specific logic without
 * pulling in the full agent store interface.
 */

/**
 * Select the currently active checkpoint (or null).
 */
export const selectActiveCheckpoint = (state) => state.activeCheckpoint;

/**
 * Select the full checkpoint history array.
 */
export const selectCheckpointHistory = (state) => state.checkpointHistory;

/**
 * Select whether a checkpoint is currently pending review.
 */
export const selectHasPendingCheckpoint = (state) =>
  state.activeCheckpoint !== null;

/**
 * Select the respond-to-checkpoint action.
 */
export const selectRespondToCheckpoint = (state) => state.respondToCheckpoint;

/**
 * Get checkpoint statistics from the history.
 */
export function getCheckpointStats() {
  const { checkpointHistory } = useAgentStore.getState();
  const total = checkpointHistory.length;
  const approved = checkpointHistory.filter((c) => c.approved).length;
  const rejected = total - approved;
  return { total, approved, rejected };
}

/**
 * Subscribe to checkpoint changes with a selector.
 * Returns an unsubscribe function.
 */
export function onCheckpointChange(callback) {
  return useAgentStore.subscribe(
    (state) => state.activeCheckpoint,
    (checkpoint, previousCheckpoint) => {
      callback(checkpoint, previousCheckpoint);
    },
  );
}

/**
 * Get the active checkpoint directly (non-reactive, for imperative code).
 */
export function getActiveCheckpoint() {
  return useAgentStore.getState().activeCheckpoint;
}

/**
 * Respond to the active checkpoint imperatively (for service code).
 */
export async function respondToCheckpoint(approved, reason = "") {
  return useAgentStore.getState().respondToCheckpoint(approved, reason);
}

export default useAgentStore;

import { useMemo } from "react";
import useTaskStore from "../store/taskStore";

/**
 * useActivityFeed — selector into taskStore.feedMessages with optional filtering.
 *
 * @param {'all' | 'security' | 'errors' | 'agent' | 'task' | 'system'} [filter='all']
 *   - 'all':      no filtering, return everything
 *   - 'security': only security checkpoint messages
 *   - 'errors':   only error messages
 *   - 'agent':    only agent activity messages
 *   - 'task':     only task lifecycle messages
 *   - 'system':   only system/gateway messages
 *
 * @returns {{ messages: Array, clearFeed: Function, totalCount: number }}
 */
export function useActivityFeed(filter = "all") {
  const feedMessages = useTaskStore((s) => s.feedMessages);
  const clearFeed = useTaskStore((s) => s.clearFeed);

  const messages = useMemo(() => {
    if (filter === "all") return feedMessages;

    return feedMessages.filter((msg) => {
      switch (filter) {
        case "security":
          return msg.type === "security";
        case "errors":
          return msg.type === "error";
        case "agent":
          return msg.type === "agent";
        case "task":
          return msg.type === "task";
        case "system":
          return msg.type === "system";
        default:
          return true;
      }
    });
  }, [feedMessages, filter]);

  return {
    messages,
    clearFeed,
    totalCount: feedMessages.length,
  };
}

export default useActivityFeed;

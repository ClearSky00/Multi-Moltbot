import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import useTaskStore from "../../store/taskStore";
import useAgentStore from "../../store/agentStore";
import FeedEntry from "./FeedEntry";

const MAX_DOM_ITEMS = 300;
const TYPE_FILTERS = ["All", "Security", "Errors"];

/**
 * ActivityFeed — live event log for agent activity.
 *
 * Height is controlled by the parent via h-full. Parent wraps this in a
 * container with a specific height (e.g. h-[240px] or flex-1 min-h-0).
 *
 * Props:
 *  filterAgentId  — when set, only show messages from this agent
 */
export default function ActivityFeed({ filterAgentId }) {
  const feedMessages = useTaskStore((s) => s.feedMessages);
  const clearFeed = useTaskStore((s) => s.clearFeed);
  const agents = useAgentStore((s) => s.agents);
  const [typeFilter, setTypeFilter] = useState("All");
  const scrollRef = useRef(null);

  // Build list of unique agents that have posted messages
  const agentsInFeed = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const msg of feedMessages) {
      if (msg.agentId && !seen.has(msg.agentId)) {
        seen.add(msg.agentId);
        result.push({
          id: msg.agentId,
          name: msg.agentName || agents[msg.agentId]?.name || msg.agentId,
        });
      }
    }
    return result;
  }, [feedMessages, agents]);

  // Apply type + agent filters
  const filtered = useMemo(() => {
    return feedMessages
      .filter((msg) => {
        if (typeFilter === "Security") return msg.type === "security";
        if (typeFilter === "Errors") return msg.type === "error";
        return true;
      })
      .filter((msg) => {
        if (filterAgentId) return msg.agentId === filterAgentId;
        return true;
      })
      .slice(0, MAX_DOM_ITEMS);
  }, [feedMessages, typeFilter, filterAgentId]);

  // Auto-scroll to top (newest first) when messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [feedMessages.length]);

  const activeAgent = filterAgentId
    ? agentsInFeed.find((a) => a.id === filterAgentId)
    : null;

  return (
    <div className="h-full flex flex-col rounded-lg border border-[color:var(--color-border-light)] bg-[color:var(--color-bg-base)] overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[color:var(--color-border-light)] bg-[color:var(--color-bg-surface)] shrink-0 gap-2 flex-wrap">
        {/* Type filter tabs */}
        <div className="flex items-center gap-0.5">
          {TYPE_FILTERS.map((tab) => (
            <button
              key={tab}
              onClick={() => setTypeFilter(tab)}
              className={cn(
                "px-2.5 py-1 rounded-[5px] font-body text-[length:var(--text-xs)]",
                "transition-all duration-[150ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]",
                "focus-visible:outline-2 focus-visible:outline-[color:var(--color-text-primary)] focus-visible:outline-offset-2",
                typeFilter === tab
                  ? "font-medium text-[color:var(--color-text-primary)] bg-[color:var(--color-bg-elevated)]"
                  : "text-[color:var(--color-text-tertiary)] bg-transparent hover:text-[color:var(--color-text-secondary)]"
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 flex-1 min-w-0 justify-end">
          {/* Active agent filter indicator */}
          {activeAgent && (
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono shrink-0"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border-medium)",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-text-primary)] inline-block" />
              {activeAgent.name}
            </motion.div>
          )}

          {/* Agent filter chips (only shown when no external filterAgentId) */}
          {!filterAgentId && agentsInFeed.length > 1 && (
            <div className="flex items-center gap-1 overflow-x-auto">
              {agentsInFeed.slice(0, 5).map((agent) => (
                <span
                  key={agent.id}
                  className="px-2 py-0.5 rounded-full text-[10px] font-mono whitespace-nowrap shrink-0"
                  style={{
                    background: "var(--color-bg-elevated)",
                    color: "var(--color-text-tertiary)",
                    border: "1px solid var(--color-border-light)",
                  }}
                >
                  {agent.name}
                </span>
              ))}
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={clearFeed}
            className="h-6 w-6 shrink-0 text-[color:var(--color-text-disabled)] hover:text-[color:var(--color-text-secondary)]"
            aria-label="Clear feed"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Feed content ───────────────────────────────────────────────── */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="py-1">
          <AnimatePresence initial={false}>
            {filtered.map((entry) => (
              <FeedEntry
                key={entry.id || `${entry.timestamp}-${entry.agentName}`}
                entry={entry}
              />
            ))}
          </AnimatePresence>

          {filtered.length === 0 && (
            <div className="flex items-center justify-center h-[140px] font-body text-[length:var(--text-sm)] text-[color:var(--color-text-disabled)]">
              {filterAgentId && activeAgent
                ? `No messages from ${activeAgent.name} yet`
                : "No activity yet"}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

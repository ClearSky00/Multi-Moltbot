import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight } from "lucide-react";
import { listSessions, readSessionLog } from "../../services/fileService";
import LoadingSpinner from "../shared/LoadingSpinner";
import EmptyState from "../shared/EmptyState";

function SessionRow({ session }) {
  const [expanded, setExpanded] = useState(false);
  const [logData, setLogData] = useState(null);
  const [loadingLog, setLoadingLog] = useState(false);

  const handleToggle = useCallback(async () => {
    if (!expanded && logData === null) {
      setLoadingLog(true);
      const result = await readSessionLog(session.agentId, session.id);
      setLogData(result?.data || []);
      setLoadingLog(false);
    }
    setExpanded((e) => !e);
  }, [expanded, logData, session.agentId, session.id]);

  const formattedDate = new Date(session.startedAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <div
      style={{
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border-light)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={handleToggle}
        aria-expanded={expanded}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "10px 14px",
          background: "var(--color-bg-base)",
          cursor: "pointer",
          transition: "background var(--dur-fast) var(--ease-smooth)",
          textAlign: "left",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--color-bg-surface)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--color-bg-base)";
        }}
        onFocus={(e) => {
          e.currentTarget.style.outline = "2px solid var(--color-text-primary)";
          e.currentTarget.style.outlineOffset = "2px";
        }}
        onBlur={(e) => {
          e.currentTarget.style.outline = "none";
        }}
      >
        {expanded ? (
          <ChevronDown
            size={14}
            style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }}
          />
        ) : (
          <ChevronRight
            size={14}
            style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }}
          />
        )}

        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
            color: "var(--color-text-tertiary)",
            flexShrink: 0,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formattedDate}
        </span>

        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-2xs)",
            color: "var(--color-text-disabled)",
            flexShrink: 0,
          }}
        >
          {session.id.slice(0, 8)}
        </span>

        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-sm)",
            color: "var(--color-text-secondary)",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {session.goal || "Session"}
        </span>

        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-2xs)",
            color: "var(--color-text-disabled)",
            flexShrink: 0,
          }}
        >
          {session.messageCount || 0} msgs
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                borderTop: "1px solid var(--color-border-light)",
                background: "var(--color-bg-surface)",
                maxHeight: 300,
                overflowY: "auto",
              }}
            >
              {loadingLog ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 24,
                  }}
                >
                  <LoadingSpinner size={16} />
                </div>
              ) : logData && logData.length > 0 ? (
                <div style={{ padding: 12 }}>
                  {logData.map((line, i) => (
                    <div
                      key={i}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "var(--text-xs)",
                        lineHeight: 1.6,
                        color: "var(--color-text-secondary)",
                        padding: "2px 0",
                        borderBottom:
                          i < logData.length - 1
                            ? "1px solid var(--color-border-light)"
                            : "none",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {typeof line === "string" ? line : JSON.stringify(line)}
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    fontFamily: "var(--font-body)",
                    fontSize: "var(--text-sm)",
                    color: "var(--color-text-disabled)",
                  }}
                >
                  No log entries
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SessionHistory({ agentId }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listSessions(agentId).then((result) => {
      if (!cancelled) {
        setSessions(result?.data || []);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 48,
        }}
      >
        <LoadingSpinner size={20} />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No sessions yet"
        description="Session history will appear here after the agent runs tasks."
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-lg)",
          fontWeight: 400,
          color: "var(--color-text-primary)",
          margin: "0 0 8px 0",
        }}
      >
        Sessions
      </h3>
      {sessions.map((session) => (
        <SessionRow key={session.id} session={{ ...session, agentId }} />
      ))}
    </div>
  );
}

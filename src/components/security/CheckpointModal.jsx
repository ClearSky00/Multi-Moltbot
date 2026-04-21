import { useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert } from "lucide-react";
import { useAgentStore } from "../../store/agentStore";
import Badge from "../shared/Badge";
import CodeBlock from "../shared/CodeBlock";

const riskVariant = {
  low: "default",
  medium: "warning",
  high: "error",
  critical: "error",
};

export default function CheckpointModal() {
  const activeCheckpoint = useAgentStore((s) => s.activeCheckpoint);
  const respondToCheckpoint = useAgentStore((s) => s.respondToCheckpoint);

  const handleApprove = useCallback(() => {
    if (activeCheckpoint) {
      respondToCheckpoint(true);
    }
  }, [activeCheckpoint, respondToCheckpoint]);

  const handleReject = useCallback(() => {
    if (activeCheckpoint) {
      respondToCheckpoint(false);
    }
  }, [activeCheckpoint, respondToCheckpoint]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (activeCheckpoint && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    if (activeCheckpoint) {
      window.addEventListener("keydown", handleKeyDown, true);
    }
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [activeCheckpoint]);

  return (
    <AnimatePresence>
      {activeCheckpoint && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--color-bg-scrim)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            zIndex: 10000,
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{
              duration: 0.32,
              ease: [0.34, 1.56, 0.64, 1],
            }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="checkpoint-title"
            aria-describedby="checkpoint-desc"
            style={{
              width: "100%",
              maxWidth: 560,
              margin: "0 24px",
              padding: "28px 32px",
              borderRadius: "var(--radius-xl)",
              background: "var(--color-bg-base)",
              boxShadow: "var(--shadow-modal)",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <ShieldAlert
                  size={22}
                  style={{
                    color: "var(--color-status-warning-dot)",
                    flexShrink: 0,
                  }}
                />
                <h2
                  id="checkpoint-title"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "26px",
                    fontWeight: 600,
                    color: "var(--color-text-primary)",
                    margin: 0,
                    lineHeight: 1.2,
                  }}
                >
                  Security Checkpoint
                </h2>
              </div>
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--text-sm)",
                  color: "var(--color-text-tertiary)",
                  paddingLeft: 32,
                }}
              >
                {activeCheckpoint.agentId} is requesting permission
              </span>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "var(--text-2xs)",
                    color: "var(--color-text-disabled)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Agent
                </span>
                <Badge label={activeCheckpoint.agentId} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "var(--text-2xs)",
                    color: "var(--color-text-disabled)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Action
                </span>
                <Badge label={activeCheckpoint.action} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "var(--text-2xs)",
                    color: "var(--color-text-disabled)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Risk
                </span>
                <Badge
                  label={activeCheckpoint.risk}
                  variant={riskVariant[activeCheckpoint.risk] || "default"}
                />
              </div>
            </div>

            <div
              id="checkpoint-desc"
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "var(--text-xs)",
                    fontWeight: 500,
                    color: "var(--color-text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  What the agent wants to do
                </span>
                <CodeBlock showCopy={false}>
                  {activeCheckpoint.action}
                </CodeBlock>
              </div>

              {activeCheckpoint.reason && (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: "var(--text-xs)",
                      fontWeight: 500,
                      color: "var(--color-text-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Why
                  </span>
                  <p
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: "var(--text-sm)",
                      fontStyle: "italic",
                      color: "var(--color-text-secondary)",
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {activeCheckpoint.reason}
                  </p>
                </div>
              )}

              {activeCheckpoint.taskId && (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: "var(--text-xs)",
                      fontWeight: 500,
                      color: "var(--color-text-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Task Context
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-xs)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {activeCheckpoint.taskId}
                  </span>
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginTop: 4,
              }}
            >
              <button
                onClick={handleReject}
                style={{
                  flex: 1,
                  padding: "10px 20px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border-strong)",
                  background: "var(--color-bg-base)",
                  color: "var(--color-text-primary)",
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all var(--dur-fast) var(--ease-smooth)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "var(--color-btn-secondary-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--color-bg-base)";
                }}
                onFocus={(e) => {
                  e.currentTarget.style.outline =
                    "2px solid var(--color-text-primary)";
                  e.currentTarget.style.outlineOffset = "2px";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.outline = "none";
                }}
              >
                Reject
              </button>

              <button
                onClick={handleApprove}
                style={{
                  flex: 1,
                  padding: "10px 20px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: "var(--color-btn-primary-bg)",
                  color: "var(--color-btn-primary-text)",
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all var(--dur-fast) var(--ease-smooth)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "var(--color-btn-primary-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    "var(--color-btn-primary-bg)";
                }}
                onFocus={(e) => {
                  e.currentTarget.style.outline =
                    "2px solid var(--color-text-primary)";
                  e.currentTarget.style.outlineOffset = "2px";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.outline = "none";
                }}
              >
                Approve
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

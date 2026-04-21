import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const typeStyles = {
  system: "bg-transparent",
  agent: "bg-transparent",
  error: "bg-[color:var(--color-status-error-bg)]",
  security: "bg-[color:var(--color-status-warning-bg)]",
  task: "bg-transparent",
};

const typeTextStyles = {
  system: "text-[color:var(--color-text-tertiary)]",
  agent: "text-[color:var(--color-text-primary)]",
  error: "text-[color:var(--color-status-error-text)]",
  security: "text-[color:var(--color-status-warning-text)]",
  task: "text-[color:var(--color-text-primary)]",
};

export default function FeedEntry({ entry }) {
  const {
    timestamp,
    agentId,
    agentName,
    content,
    detail,
    type = "system",
    message,
    recipient,
  } = entry;

  const displayContent = content || message || "";
  const displayName = agentName || agentId || null;

  const formattedTime = timestamp
    ? new Date(timestamp).toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "";

  const bgStyle = typeStyles[type] || typeStyles.system;
  const textStyle = typeTextStyles[type] || typeTextStyles.system;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        "flex items-baseline gap-2 px-3 py-1",
        "font-body text-[length:var(--text-sm)] leading-relaxed",
        "rounded-[3px]",
        bgStyle,
      )}
    >
      {/* Timestamp */}
      <span className="font-mono text-[length:var(--text-xs)] text-[color:var(--color-text-tertiary)] shrink-0 tabular-nums">
        {formattedTime}
      </span>

      {/* Agent name badge */}
      {displayName && (
        <span className="font-body font-medium text-[color:var(--color-text-secondary)] shrink-0">
          {displayName}
        </span>
      )}

      {/* Recipient arrow */}
      {recipient && (
        <>
          <span className="text-[color:var(--color-text-disabled)] shrink-0 text-[length:var(--text-xs)]">
            &rarr;
          </span>
          <span className="font-body font-medium text-[color:var(--color-text-secondary)] shrink-0">
            {recipient}
          </span>
        </>
      )}

      {/* Content */}
      <span className={cn("truncate", textStyle)}>{displayContent}</span>
    </motion.div>
  );
}

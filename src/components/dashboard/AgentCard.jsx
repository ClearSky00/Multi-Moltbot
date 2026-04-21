import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import StatusDot from "../shared/StatusDot";

const statusBadgeStyles = {
  idle: "bg-[color:var(--color-status-idle-bg)] text-[color:var(--color-text-tertiary)] border-[color:var(--color-border-light)]",
  running:
    "bg-[color:var(--color-status-running-bg)] text-[color:var(--color-text-primary)] border-[color:var(--color-border-medium)]",
  queued:
    "bg-[color:var(--color-status-paused-bg)] text-[color:var(--color-text-tertiary)] border-[color:var(--color-border-medium)]",
  error:
    "bg-[color:var(--color-status-error-bg)] text-[color:var(--color-status-error-text)] border-[color:var(--color-status-error-dot)]",
  paused:
    "bg-[color:var(--color-status-paused-bg)] text-[color:var(--color-text-tertiary)] border-[color:var(--color-border-medium)]",
};

/**
 * AgentCard — displays agent status in a card.
 *
 * Props:
 *   agent       — agent data object
 *   compact     — compact layout (less padding, smaller text) for running two-column layout
 *   isSelected  — highlights this card as the active feed filter
 *   onSelect    — when provided, clicking calls onSelect(agentId) instead of navigating.
 *                 A small "View →" link still navigates to the detail screen.
 */
export default function AgentCard({ agent, compact = false, isSelected = false, onSelect }) {
  const navigate = useNavigate();
  const { id, name, role, status = "idle", currentAction, model } = agent;

  const badgeStyle = statusBadgeStyles[status] || statusBadgeStyles.idle;

  const handleClick = () => {
    if (onSelect) {
      onSelect(id);
    } else {
      navigate(`/agents?id=${id}`);
    }
  };

  const handleViewDetail = (e) => {
    e.stopPropagation();
    navigate(`/agents?id=${id}`);
  };

  return (
    <motion.div layout>
      <Card
        onClick={handleClick}
        tabIndex={0}
        role="button"
        aria-label={`Agent ${name}, status ${status}${isSelected ? ', filtering activity feed' : ''}`}
        aria-pressed={isSelected}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        className={cn(
          "cursor-pointer transition-all duration-[240ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]",
          "bg-[color:var(--color-bg-base)] border-[color:var(--color-border-light)]",
          "shadow-[var(--shadow-card)]",
          compact ? "hover:shadow-sm hover:-translate-y-px" : "hover:shadow-[var(--shadow-hover)] hover:-translate-y-0.5",
          "focus-visible:outline-2 focus-visible:outline-[color:var(--color-text-primary)] focus-visible:outline-offset-2",
          status === "error" && "border-l-2 border-l-[color:var(--color-status-error-dot)]",
          status === "paused" && "border-dashed",
          isSelected && "ring-2 ring-[color:var(--color-text-primary)] ring-offset-1",
        )}
      >
        <CardHeader className={cn("pb-1", compact ? "p-3" : "p-4 pb-2")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusDot status={status} size={7} />
              <CardTitle
                className={cn(
                  "font-body font-medium text-[color:var(--color-text-primary)]",
                  compact ? "text-[12px]" : "text-[length:var(--text-md)]"
                )}
              >
                {name}
              </CardTitle>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge
                variant="outline"
                className={cn(
                  "font-body font-normal capitalize",
                  compact ? "text-[9px] px-1.5 py-0" : "text-[length:var(--text-2xs)]",
                  badgeStyle
                )}
              >
                {status}
              </Badge>
              {/* View detail link — always navigates */}
              {onSelect && (
                <button
                  onClick={handleViewDetail}
                  aria-label={`View ${name} details`}
                  className="text-[color:var(--color-text-disabled)] hover:text-[color:var(--color-text-secondary)] transition-colors duration-150 p-0.5 rounded"
                  title="View agent detail"
                >
                  <ExternalLink size={compact ? 10 : 12} />
                </button>
              )}
            </div>
          </div>
          <CardDescription
            className={cn(
              "font-body uppercase tracking-wider mt-1",
              compact ? "text-[9px]" : "text-[length:var(--text-xs)]",
              "text-[color:var(--color-text-tertiary)]"
            )}
          >
            {role}
          </CardDescription>
        </CardHeader>

        <CardContent className={cn("pt-0", compact ? "px-3 pb-2" : "p-4 pt-0")}>
          <div
            className={cn(
              "font-body leading-relaxed mb-2",
              compact ? "text-[11px] min-h-[16px]" : "text-[length:var(--text-sm)] min-h-[20px] mb-3",
              status === "error" && "text-[color:var(--color-status-error-text)]",
              status === "paused" && "text-[color:var(--color-status-warning-text)] italic",
              status !== "error" && status !== "paused" && "text-[color:var(--color-text-secondary)]",
            )}
          >
            {status === "running" && currentAction
              ? currentAction
              : status === "queued"
              ? "Queued — waiting for local model…"
              : status === "error"
              ? "Error occurred"
              : status === "paused"
              ? "Awaiting approval…"
              : "Awaiting task…"}
          </div>

          <div className="flex items-center justify-between">
            <span
              className={cn(
                "font-mono text-[color:var(--color-text-disabled)]",
                compact ? "text-[9px]" : "text-[length:var(--text-2xs)]"
              )}
            >
              {model || id}
            </span>
            {isSelected && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="font-mono text-[9px] text-[color:var(--color-text-tertiary)] bg-[color:var(--color-bg-elevated)] px-1.5 py-0.5 rounded"
              >
                filtered
              </motion.span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

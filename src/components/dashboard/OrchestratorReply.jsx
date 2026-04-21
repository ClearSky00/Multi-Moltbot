import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, AlertCircle, Loader2, MessageSquare, Bot } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import useAgentStore from "../../store/agentStore";
import useTaskStore from "../../store/taskStore";

const MAX_CHARS = 2000;

export default function OrchestratorReply({ taskId, onDismiss }) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const replyToTask = useAgentStore((s) => s.replyToTask);
  const addConversationMessage = useTaskStore((s) => s.addConversationMessage);
  const clearAwaitingReply = useTaskStore((s) => s.setAwaitingReply);

  const conversation = useTaskStore(
    (s) => s.conversationMessages[taskId] || [],
  );
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === taskId));

  // Determine the last orchestrator response to display as context
  const lastResponse =
    conversation.filter((m) => m.role === "orchestrator").pop()?.text ||
    task?.result ||
    "Awaiting your reply...";

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      // Add user message to local convo state immediately for UI snappiness
      addConversationMessage(taskId, {
        role: "user",
        text: trimmed,
        timestamp: Date.now(),
      });

      const result = await replyToTask(taskId, trimmed);

      if (result?.error) {
        setError(
          typeof result.error === "string" ? result.error : "Reply failed",
        );
        setSubmitting(false);
      } else {
        // Success - clear the awaiting flag so the UI returns to the running task view
        clearAwaitingReply(taskId, false);
      }
    } catch (err) {
      setError(err?.message || "Reply failed");
      setSubmitting(false);
    }
  }, [
    value,
    submitting,
    taskId,
    replyToTask,
    addConversationMessage,
    clearAwaitingReply,
  ]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleDismiss = () => {
    clearAwaitingReply(taskId, false);
    if (onDismiss) onDismiss();
  };

  const charWarning = value.length > MAX_CHARS * 0.9;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="flex flex-col gap-3 rounded-lg border border-[color:var(--color-border-medium)] bg-[color:var(--color-bg-surface)] p-4 shadow-sm"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--color-text-primary)]">
          <Bot className="h-4 w-4 text-primary" />
          <span>Orchestrator ready</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
        >
          Dismiss
        </Button>
      </div>

      <div className="bg-muted rounded-md p-3 text-sm text-[color:var(--color-text-secondary)] whitespace-pre-wrap max-h-48 overflow-y-auto mb-1">
        {lastResponse}
      </div>

      <div className="relative">
        <Textarea
          value={value}
          onChange={(e) => {
            if (e.target.value.length <= MAX_CHARS) {
              setValue(e.target.value);
              if (error) setError(null);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type your reply to continue..."
          rows={2}
          disabled={submitting}
          className={cn(
            "resize-none font-body text-[length:var(--text-sm)] pt-3 pr-12",
            "bg-[color:var(--color-input-bg)] border-[color:var(--color-border-strong)]",
            "focus-visible:ring-[color:var(--color-input-border-focus)]",
            "min-h-[70px]",
            error && "border-[color:var(--color-status-error-dot)]",
          )}
        />
        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={!value.trim() || submitting}
          className={cn(
            "absolute bottom-2.5 right-2.5 h-7 w-7 rounded-md",
            "bg-[color:var(--color-btn-primary-bg)] text-[color:var(--color-btn-primary-text)]",
            "hover:bg-[color:var(--color-btn-primary-hover)]",
          )}
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-1.5 px-0.5 text-[color:var(--color-status-error-dot)]">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="text-xs leading-snug">{error}</span>
        </div>
      )}
    </motion.div>
  );
}

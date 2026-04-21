import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, AlertCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import useAgentStore from "../../store/agentStore";
import useToastStore from "../../store/toastStore";
import { useGateway } from "../../hooks/useGateway";

const MAX_CHARS = 2000;
const ERROR_DISPLAY_MS = 6000;

export default function GoalInput() {
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const errorTimerRef = useRef(null);
  const textareaRef = useRef(null);
  const submitGoal = useAgentStore((s) => s.submitGoal);
  const { status: gwStatus } = useGateway();

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  // Focus this textarea when Ctrl+K / Ctrl+N is pressed globally
  useEffect(() => {
    const handler = () => textareaRef.current?.focus();
    window.addEventListener('hivemind:focus-goal-input', handler);
    return () => window.removeEventListener('hivemind:focus-goal-input', handler);
  }, []);

  const showError = useCallback((msg) => {
    setError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), ERROR_DISPLAY_MS);
  }, []);

  const handleChange = useCallback(
    (e) => {
      const text = e.target.value;
      if (text.length <= MAX_CHARS) {
        setValue(text);
        if (error) setError(null);
      }
    },
    [error],
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError(null);
    setSubmitted(true);

    try {
      const result = await submitGoal(trimmed);

      if (result?.error) {
        showError(result.error);
        setSubmitted(false);
        useToastStore.getState().addToast({
          type: 'error',
          title: 'Goal submission failed',
          message: typeof result.error === 'string' ? result.error : 'Could not submit goal',
        });
      } else {
        setTimeout(() => {
          setValue("");
          setSubmitted(false);
        }, 600);
      }
    } catch (err) {
      const msg = err?.message || "Goal submission failed";
      showError(msg);
      setSubmitted(false);
      useToastStore.getState().addToast({ type: 'error', title: 'Goal submission failed', message: msg });
    } finally {
      setSubmitting(false);
    }
  }, [value, submitting, submitGoal, showError]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const charWarning = value.length > MAX_CHARS * 0.9;
  const gatewayDown = gwStatus !== "connected";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={submitted ? "submitted" : "editing"}
        initial={submitted ? { scale: 1, opacity: 1 } : { opacity: 0, y: 12 }}
        animate={submitted ? { scale: 0.96, opacity: 0 } : { opacity: 1, y: 0 }}
        exit={submitted ? { scale: 0.96, opacity: 0 } : { opacity: 0, y: -8 }}
        transition={{
          duration: submitted ? 0.4 : 0.3,
          ease: submitted ? [0.4, 0, 1, 1] : [0.25, 0.46, 0.45, 0.94],
        }}
        className="flex flex-col gap-2"
      >
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={
              gatewayDown
                ? "Gateway disconnected — connect first, then submit a goal"
                : "What should your agents accomplish?"
            }
            rows={3}
            disabled={submitting}
            className={cn(
              "resize-none font-body text-[length:var(--text-md)] leading-[22px] pr-14",
              "bg-[color:var(--color-input-bg)] border-[color:var(--color-input-border)]",
              "focus-visible:ring-[color:var(--color-input-border-focus)]",
              "text-[color:var(--color-text-primary)]",
              "placeholder:text-[color:var(--color-text-disabled)]",
              "min-h-[90px] rounded-lg p-4",
              error && "border-[color:var(--color-status-error-dot)]",
            )}
          />
          <Button
            size="icon"
            onClick={handleSubmit}
            disabled={!value.trim() || submitting}
            className={cn(
              "absolute bottom-3 right-3",
              "bg-[color:var(--color-btn-primary-bg)] text-[color:var(--color-btn-primary-text)]",
              "hover:bg-[color:var(--color-btn-primary-hover)]",
              "rounded-md h-8 w-8",
              "disabled:opacity-30",
            )}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-start gap-2 px-1"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[color:var(--color-status-error-dot)]" />
              <span className="font-body text-[length:var(--text-xs)] text-[color:var(--color-status-error-dot)] leading-snug">
                {error}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 font-body text-[length:var(--text-xs)] text-[color:var(--color-text-disabled)]">
            <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-[3px] bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border-medium)] font-mono text-[length:var(--text-2xs)] font-medium text-[color:var(--color-text-tertiary)] shadow-[0_1px_0_var(--color-border-medium)]">
              Enter
            </kbd>
            <span>to submit</span>
            <span className="mx-1">/</span>
            <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-[3px] bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border-medium)] font-mono text-[length:var(--text-2xs)] font-medium text-[color:var(--color-text-tertiary)] shadow-[0_1px_0_var(--color-border-medium)]">
              Shift+Enter
            </kbd>
            <span>for newline</span>
            <span className="mx-1 opacity-50">/</span>
            <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-[3px] bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border-medium)] font-mono text-[length:var(--text-2xs)] font-medium text-[color:var(--color-text-tertiary)] shadow-[0_1px_0_var(--color-border-medium)]">
              Ctrl+K
            </kbd>
            <span>to focus</span>
          </div>
          <span
            className={cn(
              "font-mono text-[length:var(--text-2xs)]",
              charWarning
                ? "text-[color:var(--color-status-warning-text)]"
                : "text-[color:var(--color-text-disabled)]",
            )}
          >
            {value.length}/{MAX_CHARS}
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

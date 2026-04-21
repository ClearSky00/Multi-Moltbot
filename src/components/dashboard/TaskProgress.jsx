import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Square, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import useAgentStore from "../../store/agentStore";

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function TaskProgress() {
  const activeGoal = useAgentStore((s) => s.activeGoal);
  const activeTaskId = useAgentStore((s) => s.activeTaskId);
  const isRunning = useAgentStore((s) => s.isRunning);
  const isStopping = useAgentStore((s) => s.isStopping);
  const stopAll = useAgentStore((s) => s.stopAll);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (isRunning) {
      setElapsed(0);
      intervalRef.current = setInterval(() => {
        setElapsed((e) => e + 1);
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning]);

  return (
    <AnimatePresence>
      {isRunning && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="overflow-hidden"
        >
          <Card className="p-4 bg-[color:var(--color-bg-surface)] border-[color:var(--color-border-medium)]">
            <div className="flex items-center gap-4">
              {/* Content */}
              <div className="flex-1 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-body text-[length:var(--text-sm)] font-medium text-[color:var(--color-text-primary)] truncate max-w-[70%]">
                    {activeGoal || "Running task..."}
                  </span>
                  <span className="font-mono text-[length:var(--text-xs)] text-[color:var(--color-text-tertiary)] tabular-nums">
                    {formatElapsed(elapsed)}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-[3px] rounded-full bg-[color:var(--color-bg-elevated)] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-[color:var(--color-text-primary)]"
                    style={{ width: "40%" }}
                    animate={{ x: ["-100%", "250%"] }}
                    transition={{
                      duration: 1.8,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                </div>
              </div>

              {/* Stop button */}
              <Button
                variant="outline"
                size="icon"
                onClick={stopAll}
                disabled={isStopping}
                aria-label="Stop execution"
                className={cn(
                  "h-8 w-8 shrink-0",
                  "border-[color:var(--color-border-medium)] bg-[color:var(--color-bg-base)]",
                  "text-[color:var(--color-text-secondary)]",
                  "hover:bg-[color:var(--color-status-error-bg)] hover:text-[color:var(--color-status-error-text)] hover:border-[color:var(--color-status-error-dot)]",
                  "transition-all duration-[150ms]",
                )}
              >
                {isStopping ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Square className="h-3.5 w-3.5" fill="currentColor" />
                )}
              </Button>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

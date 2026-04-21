import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react';
import useAgentStore from '../../store/agentStore';
import useTaskStore from '../../store/taskStore';

const MAX_CHARS = 2000;

// ── Animation presets ────────────────────────────────────────────────────────
const spring = { type: 'spring', stiffness: 340, damping: 28 };
const smooth = { duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] };
const fastSmooth = { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] };

const panelVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { ...spring, staggerChildren: 0.06, delayChildren: 0.04 },
  },
  exit: { opacity: 0, y: 10, scale: 0.98, transition: smooth },
};

const sectionVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: spring },
};

const collapseVariants = {
  hidden: { height: 0, opacity: 0 },
  visible: { height: 'auto', opacity: 1, transition: smooth },
  exit: { height: 0, opacity: 0, transition: fastSmooth },
};

/**
 * OrchestratorDialogue — "Consultation Mode" panel.
 *
 * Displayed when the orchestrator pauses a task to ask the user for clarification.
 * Design: Editorial Monochrome.
 */
export default function OrchestratorDialogue({ taskId, onDismiss }) {
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const textareaRef = useRef(null);

  const replyToTask = useAgentStore((s) => s.replyToTask);
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === taskId));
  const conversation = useTaskStore((s) => s.conversationMessages[taskId] || []);

  const orchestratorMessages = conversation.filter((m) => m.role === 'orchestrator');
  const currentQuestion = orchestratorMessages[orchestratorMessages.length - 1]?.text || '';
  const history = conversation.slice(0, -1);

  useEffect(() => {
    const timer = setTimeout(() => textareaRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError(null);

    const result = await replyToTask(taskId, trimmed);

    if (result?.error) {
      const msg = typeof result.error === 'string' ? result.error : 'Reply failed';
      // Task already moved to a different state — auto-dismiss
      if (msg.includes('not awaiting') || msg.includes('awaiting')) {
        onDismiss?.();
        return;
      }
      setError(msg);
      setSubmitting(false);
    }
  }, [value, submitting, taskId, replyToTask, onDismiss]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const charPct = value.length / MAX_CHARS;
  const charWarning = charPct > 0.85;

  return (
    <motion.div
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex flex-col rounded-xl border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-base)] overflow-hidden"
      style={{ boxShadow: '0 4px 32px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.05)' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div
        variants={sectionVariants}
        className="flex items-center justify-between px-5 py-3 border-b border-[color:var(--color-border-light)] bg-[color:var(--color-bg-surface)]"
      >
        <div className="flex items-center gap-3">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[color:var(--color-status-warning-dot)] opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[color:var(--color-status-warning-dot)]" />
          </span>
          <span className="font-mono text-[10px] font-semibold tracking-widest uppercase text-[color:var(--color-text-tertiary)]">
            Consultation Required
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="flex items-center gap-1 font-body text-[11px] text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)] transition-colors duration-150 px-2 py-1 rounded hover:bg-[color:var(--color-bg-elevated)]"
          title="Dismiss (task remains paused)"
        >
          <X className="h-3 w-3" />
          <span>Dismiss</span>
        </button>
      </motion.div>

      {/* ── Goal context ───────────────────────────────────────────────────── */}
      {task?.goal && (
        <motion.div variants={sectionVariants} className="px-5 pt-4 pb-0">
          <p className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--color-text-disabled)] mb-1">
            Goal
          </p>
          <p className="font-body text-[13px] text-[color:var(--color-text-secondary)] leading-snug line-clamp-2">
            {task.goal}
          </p>
        </motion.div>
      )}

      {/* ── Conversation history ─────────────────────────────────────────── */}
      <AnimatePresence>
        {history.length > 0 && (
          <motion.div
            variants={sectionVariants}
            className="px-5 pt-4"
          >
            <button
              onClick={() => setHistoryExpanded((p) => !p)}
              className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest uppercase text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)] transition-colors duration-150"
            >
              <motion.span
                animate={{ rotate: historyExpanded ? 180 : 0 }}
                transition={fastSmooth}
                className="inline-flex"
              >
                <ChevronDown className="h-3 w-3" />
              </motion.span>
              {historyExpanded ? 'Hide' : 'Show'} prior exchanges ({Math.ceil(history.length / 2)})
            </button>

            <AnimatePresence>
              {historyExpanded && (
                <motion.div
                  variants={collapseVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="overflow-hidden"
                >
                  <div className="mt-3 flex flex-col gap-3 pb-2">
                    {history.map((msg, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ ...smooth, delay: i * 0.04 }}
                      >
                        <HistoryEntry message={msg} />
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Current Question ───────────────────────────────────────────────── */}
      <motion.div variants={sectionVariants} className="px-5 pt-5 pb-2">
        <div className="flex items-start gap-0">
          <motion.div
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ ...spring, delay: 0.1 }}
            className="w-[3px] shrink-0 rounded-full mr-4 mt-1 self-stretch origin-top"
            style={{ background: 'var(--color-text-primary)', minHeight: '1.5rem' }}
          />
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--color-text-tertiary)] mb-2">
              Orchestrator
            </p>
            <p className="font-body text-[15px] font-normal text-[color:var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">
              {currentQuestion}
            </p>
          </div>
        </div>
      </motion.div>

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      <motion.div
        variants={sectionVariants}
        className="mx-5 mt-4 border-t border-[color:var(--color-border-light)]"
      />

      {/* ── Reply zone ─────────────────────────────────────────────────────── */}
      <motion.div variants={sectionVariants} className="px-5 pt-4 pb-5">
        <p className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--color-text-tertiary)] mb-2">
          Your Response
        </p>

        <div className="relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              if (e.target.value.length <= MAX_CHARS) {
                setValue(e.target.value);
                if (error) setError(null);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type your answer… (Enter to send, Shift+Enter for newline)"
            rows={3}
            disabled={submitting}
            className="w-full resize-none font-body text-[14px] text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-disabled)] bg-transparent outline-none leading-relaxed disabled:opacity-50 transition-opacity duration-200"
            style={{ caretColor: 'var(--color-text-primary)' }}
          />

          <div className="flex items-center justify-between mt-3">
            <span
              className={`font-mono text-[11px] transition-colors duration-150 ${
                charWarning
                  ? 'text-[color:var(--color-status-warning-dot)]'
                  : 'text-[color:var(--color-text-disabled)]'
              }`}
            >
              {value.length > 0 ? `${value.length} / ${MAX_CHARS}` : ''}
            </span>

            <motion.button
              onClick={handleSubmit}
              disabled={!value.trim() || submitting}
              whileHover={{ scale: value.trim() && !submitting ? 1.02 : 1 }}
              whileTap={{ scale: value.trim() && !submitting ? 0.97 : 1 }}
              transition={fastSmooth}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-body text-[13px] font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: value.trim() && !submitting
                  ? 'var(--color-btn-primary-bg)'
                  : 'var(--color-bg-elevated)',
                color: value.trim() && !submitting
                  ? 'var(--color-btn-primary-text)'
                  : 'var(--color-text-tertiary)',
              }}
            >
              <AnimatePresence mode="wait">
                {submitting ? (
                  <motion.span
                    key="spinner"
                    initial={{ opacity: 0, rotate: -90 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0 }}
                    transition={fastSmooth}
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="send"
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={fastSmooth}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </motion.span>
                )}
              </AnimatePresence>
              <span>{submitting ? 'Sending…' : 'Send'}</span>
              {!submitting && (
                <kbd className="font-mono text-[10px] opacity-50 ml-0.5">↵</kbd>
              )}
            </motion.button>
          </div>
        </div>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -4, height: 0 }}
              transition={fastSmooth}
              className="mt-2 font-body text-[12px] text-[color:var(--color-status-error-dot)]"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

function HistoryEntry({ message }) {
  const isOrchestrator = message.role === 'orchestrator';
  return (
    <div className={`flex items-start gap-3 ${isOrchestrator ? 'opacity-55' : 'opacity-65'}`}>
      <span className="font-mono text-[9px] tracking-widest uppercase pt-0.5 w-20 shrink-0 text-right text-[color:var(--color-text-tertiary)]">
        {isOrchestrator ? 'Orchestrator' : 'You'}
      </span>
      <p className="font-body text-[12px] text-[color:var(--color-text-secondary)] leading-snug whitespace-pre-wrap">
        {message.text}
      </p>
    </div>
  );
}

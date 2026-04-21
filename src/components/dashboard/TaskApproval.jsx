import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCheck, ArrowRight, X, Loader2 } from 'lucide-react';
import useAgentStore from '../../store/agentStore';
import useTaskStore from '../../store/taskStore';

const MAX_CHARS = 2000;

// ── Animation presets ────────────────────────────────────────────────────────
const spring = { type: 'spring', stiffness: 340, damping: 28 };
const smooth = { duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] };
const fastSmooth = { duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] };

const panelVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { ...spring, staggerChildren: 0.07, delayChildren: 0.04 },
  },
  exit: { opacity: 0, y: 10, scale: 0.98, transition: smooth },
};

const sectionVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: spring },
};

/**
 * TaskApproval — shown when the orchestrator has finished and is waiting
 * for the user to either mark the task as done or continue with a follow-up.
 *
 * Design: Editorial Monochrome — executive summary memo delivered for sign-off.
 */
export default function TaskApproval({ taskId, result, onDismiss }) {
  const [followUp, setFollowUp] = useState('');
  const [approving, setApproving] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState(null);
  const textareaRef = useRef(null);

  const approveTask = useAgentStore((s) => s.approveTask);
  const replyToTask = useAgentStore((s) => s.replyToTask);
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === taskId));

  const charPct = followUp.length / MAX_CHARS;
  const charWarning = charPct > 0.85;
  const busy = approving || continuing;

  useEffect(() => {
    const timer = setTimeout(() => textareaRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, []);

  const handleApprove = useCallback(async () => {
    if (busy) return;
    setApproving(true);
    setError(null);
    const res = await approveTask(taskId);
    if (res?.error) {
      setError(typeof res.error === 'string' ? res.error : 'Could not mark as done');
      setApproving(false);
    }
    // On success task:completed fires → GatewayContext clears awaitingApprovalTask
  }, [busy, taskId, approveTask]);

  const handleContinue = useCallback(async () => {
    const trimmed = followUp.trim();
    if (!trimmed || busy) return;
    setContinuing(true);
    setError(null);
    const res = await replyToTask(taskId, trimmed);
    if (res?.error) {
      setError(typeof res.error === 'string' ? res.error : 'Could not send follow-up');
      setContinuing(false);
    }
    // On success, agentStore clears awaitingApprovalTask and task resumes running
  }, [followUp, busy, taskId, replyToTask]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleContinue();
      }
    },
    [handleContinue]
  );

  return (
    <motion.div
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex flex-col rounded-xl border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-base)] overflow-hidden"
      style={{ boxShadow: '0 4px 32px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.05)' }}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <motion.div
        variants={sectionVariants}
        className="flex items-center justify-between px-5 py-3 border-b border-[color:var(--color-border-light)] bg-[color:var(--color-bg-surface)]"
      >
        <div className="flex items-center gap-3">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[color:var(--color-status-success-dot)] opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[color:var(--color-status-success-dot)]" />
          </span>
          <span className="font-mono text-[10px] font-semibold tracking-widest uppercase text-[color:var(--color-text-tertiary)]">
            Ready for Review
          </span>
        </div>
        <button
          onClick={onDismiss}
          disabled={busy}
          className="flex items-center gap-1 font-body text-[11px] text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)] transition-colors duration-150 px-2 py-1 rounded hover:bg-[color:var(--color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed"
          title="Dismiss panel (task stays in review state)"
        >
          <X className="h-3 w-3" />
          <span>Dismiss</span>
        </button>
      </motion.div>

      {/* ── Goal context ────────────────────────────────────────────────────── */}
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

      {/* ── Result ──────────────────────────────────────────────────────────── */}
      <motion.div variants={sectionVariants} className="px-5 pt-5 pb-2">
        <div className="flex items-start">
          <motion.div
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ ...spring, delay: 0.14 }}
            className="w-[3px] shrink-0 rounded-full mr-4 mt-1 self-stretch origin-top"
            style={{ background: 'var(--color-status-success-dot)', minHeight: '1.5rem' }}
          />
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--color-text-tertiary)] mb-2">
              Result
            </p>
            <div
              className="max-h-48 overflow-y-auto pr-1"
              style={{ scrollbarWidth: 'thin' }}
            >
              <p className="font-body text-[14px] font-normal text-[color:var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">
                {result || '(No output)'}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Divider ─────────────────────────────────────────────────────────── */}
      <motion.div
        variants={sectionVariants}
        className="mx-5 mt-4 border-t border-[color:var(--color-border-light)]"
      />

      {/* ── Action zone ─────────────────────────────────────────────────────── */}
      <motion.div variants={sectionVariants} className="px-5 pt-4 pb-5">
        <p className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--color-text-tertiary)] mb-2">
          Continue (optional)
        </p>

        <div className="relative mb-4">
          <textarea
            ref={textareaRef}
            value={followUp}
            onChange={(e) => {
              if (e.target.value.length <= MAX_CHARS) {
                setFollowUp(e.target.value);
                if (error) setError(null);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a follow-up instruction… (Enter to send, Shift+Enter for newline)"
            rows={2}
            disabled={busy}
            className="w-full resize-none font-body text-[14px] text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-disabled)] bg-transparent outline-none leading-relaxed disabled:opacity-50 transition-opacity duration-200"
            style={{ caretColor: 'var(--color-text-primary)' }}
          />
          {followUp.length > 0 && (
            <span
              className={`font-mono text-[11px] transition-colors duration-150 ${
                charWarning
                  ? 'text-[color:var(--color-status-warning-dot)]'
                  : 'text-[color:var(--color-text-disabled)]'
              }`}
            >
              {followUp.length} / {MAX_CHARS}
            </span>
          )}
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between gap-3">
          <motion.button
            onClick={handleContinue}
            disabled={!followUp.trim() || busy}
            whileHover={{ scale: followUp.trim() && !busy ? 1.02 : 1 }}
            whileTap={{ scale: followUp.trim() && !busy ? 0.97 : 1 }}
            transition={fastSmooth}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-body text-[13px] font-medium border transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              borderColor: 'var(--color-border-medium)',
              background: 'var(--color-bg-surface)',
              color: 'var(--color-text-primary)',
            }}
          >
            <AnimatePresence mode="wait">
              {continuing ? (
                <motion.span key="spin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fastSmooth}>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                </motion.span>
              ) : (
                <motion.span key="arrow" initial={{ opacity: 0, x: -3 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={fastSmooth}>
                  <ArrowRight className="h-3.5 w-3.5" />
                </motion.span>
              )}
            </AnimatePresence>
            <span>{continuing ? 'Sending…' : 'Continue'}</span>
          </motion.button>

          <motion.button
            onClick={handleApprove}
            disabled={busy}
            whileHover={{ scale: !busy ? 1.02 : 1 }}
            whileTap={{ scale: !busy ? 0.97 : 1 }}
            transition={fastSmooth}
            className="flex items-center gap-2 px-5 py-2 rounded-lg font-body text-[13px] font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: busy ? 'var(--color-bg-elevated)' : 'var(--color-btn-primary-bg)',
              color: busy ? 'var(--color-text-tertiary)' : 'var(--color-btn-primary-text)',
            }}
          >
            <AnimatePresence mode="wait">
              {approving ? (
                <motion.span key="spin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fastSmooth}>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                </motion.span>
              ) : (
                <motion.span key="check" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={fastSmooth}>
                  <CheckCheck className="h-3.5 w-3.5" />
                </motion.span>
              )}
            </AnimatePresence>
            <span>{approving ? 'Completing…' : 'Mark as Done'}</span>
          </motion.button>
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

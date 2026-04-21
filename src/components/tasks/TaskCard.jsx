import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  AlertTriangle,
  MessageCircle,
  RefreshCw,
  Trash2,
  ChevronDown,
  Package,
  Send,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import useTaskStore from '../../store/taskStore';
import useBuildStore from '../../store/buildStore';
import useToastStore from '../../store/toastStore';
import { deleteTask as deleteTaskDb } from '../../services/db';
import { cancelTask, respondToTask } from '../../services/openclaw';
import ConfirmDialog from '../shared/ConfirmDialog';
import TaskTimeline from './TaskTimeline';

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    icon: Clock,
    badgeClass: 'bg-secondary text-secondary-foreground',
    borderColor: 'var(--color-border-medium)',
    spin: false,
  },
  running: {
    label: 'Running',
    icon: Loader2,
    badgeClass: 'bg-primary text-primary-foreground',
    borderColor: 'var(--color-border-accent)',
    spin: true,
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    borderColor: 'var(--color-status-success-dot)',
    spin: false,
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    badgeClass: 'bg-red-100 text-red-800 border-red-200',
    borderColor: 'var(--color-status-error-dot)',
    spin: false,
  },
  cancelled: {
    label: 'Cancelled',
    icon: AlertCircle,
    badgeClass: 'bg-muted text-muted-foreground',
    borderColor: 'var(--color-border-light)',
    spin: false,
  },
  awaiting_input: {
    label: 'Awaiting Input',
    icon: MessageCircle,
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    borderColor: 'var(--color-status-warning-dot)',
    spin: false,
  },
  quota_exhausted: {
    label: 'Quota Exhausted',
    icon: AlertTriangle,
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    borderColor: 'var(--color-status-warning-dot)',
    spin: false,
  },
};

function formatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatElapsed(createdAt, completedAt) {
  const start = new Date(createdAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const diffMs = end - start;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainSec}s`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  return `${hours}h ${remainMin}m`;
}

export default function TaskCard({ task, index }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState('');

  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const removeTask = useTaskStore((s) => s.removeTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const resumeTaskAction = useTaskStore((s) => s.resumeTask);

  const relatedBuilds = useBuildStore((s) =>
    s.builds.filter((b) => b.task_id === task.id)
  );
  const selectBuild = useBuildStore((s) => s.selectBuild);

  const created = task.createdAt || task.created_at;
  const completed = task.completedAt || task.completed_at;
  const assignedAgents = task.assigned_agents || task.assignedAgents || [];
  const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;

  const canCancel = task.status === 'pending' || task.status === 'running' || task.status === 'awaiting_input';
  const canDelete = task.status === 'failed' || task.status === 'completed' || task.status === 'cancelled';
  const canResume = task.status === 'quota_exhausted';
  const canReply = task.status === 'awaiting_input';

  const handleCancelConfirmed = useCallback(async () => {
    setShowCancelConfirm(false);
    setActionError('');
    setBusy(true);
    try {
      const result = await cancelTask({ taskId: task.id });
      if (result?.error) {
        setActionError(typeof result.error === 'string' ? result.error : 'Could not cancel task');
        return;
      }
      updateTask(task.id, { status: 'cancelled', completedAt: new Date().toISOString() });
      await fetchTasks();
    } catch (err) {
      setActionError(err?.message || 'Request failed');
    } finally {
      setBusy(false);
    }
  }, [task.id, cancelTask, updateTask, fetchTasks]);

  const handleDeleteConfirmed = useCallback(async () => {
    setShowDeleteConfirm(false);
    setActionError('');
    setBusy(true);
    // Optimistically remove; get rollback function
    const rollback = removeTask(task.id);
    try {
      const result = await deleteTaskDb(task.id);
      if (result?.error) {
        rollback();
        const msg = typeof result.error === 'string' ? result.error : 'Could not remove task';
        setActionError(msg);
        useToastStore.getState().addToast({ type: 'error', title: 'Remove failed', message: msg });
        return;
      }
    } catch (err) {
      rollback();
      const msg = err?.message || 'Request failed';
      setActionError(msg);
      useToastStore.getState().addToast({ type: 'error', title: 'Remove failed', message: msg });
    } finally {
      setBusy(false);
    }
  }, [task.id, removeTask]);

  const handleResume = useCallback(async () => {
    setBusy(true);
    setActionError('');
    const result = await resumeTaskAction(task.id);
    setBusy(false);
    if (result?.error) setActionError(result.error);
  }, [task.id, resumeTaskAction]);

  const handleReply = useCallback(async () => {
    if (!replyText.trim() || replying) return;
    setReplying(true);
    setReplyError('');
    try {
      const result = await respondToTask(task.id, replyText.trim());
      if (result?.error) {
        setReplyError(typeof result.error === 'string' ? result.error : 'Reply failed');
        return;
      }
      setReplyText('');
      updateTask(task.id, { status: 'running' });
    } catch (err) {
      setReplyError(err?.message || 'Reply failed');
    } finally {
      setReplying(false);
    }
  }, [replyText, replying, task.id, respondToTask, updateTask]);

  const handleBuildClick = useCallback((buildId) => {
    selectBuild(buildId);
    navigate('/builds');
  }, [selectBuild, navigate]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.24, delay: index * 0.04, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="mb-3"
      >
        <div
          className="rounded-lg border border-[var(--color-border-light)] bg-white overflow-hidden transition-shadow hover:shadow-md"
          style={{ borderLeft: `3px solid ${config.borderColor}` }}
        >
          {/* Card header — always visible, clickable to expand */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full text-left p-4 pb-3"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium leading-snug flex-1 min-w-0 text-[var(--color-text-primary)] line-clamp-2">
                {task.goal}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className={cn('gap-1', config.badgeClass)}>
                  <StatusIcon className={cn('h-3 w-3', config.spin && 'animate-spin')} />
                  {config.label}
                </Badge>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-[var(--color-text-tertiary)] transition-transform duration-200',
                    expanded && 'rotate-180'
                  )}
                />
              </div>
            </div>

            {/* Footer: timestamp + elapsed + actions (collapsed view) */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
              <span className="font-mono">{formatTimestamp(created)}</span>
              <span className="flex items-center gap-1 font-mono">
                <Clock className="h-3 w-3 shrink-0" />
                {formatElapsed(created, completed)}
              </span>
              {assignedAgents.length > 0 && (
                <span className="text-[var(--color-text-tertiary)]">
                  {assignedAgents.length} agent{assignedAgents.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </button>

          {/* Expanded detail section */}
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
                style={{ overflow: 'hidden' }}
              >
                <Separator />
                <div className="p-4 space-y-4">
                  {/* Timeline */}
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      Timeline
                    </p>
                    <TaskTimeline task={task} />
                  </div>

                  {/* Result */}
                  {task.result && task.status !== 'quota_exhausted' && (
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        Result
                      </p>
                      <pre className="font-mono text-xs text-secondary-foreground bg-muted rounded-md p-3 whitespace-pre-wrap break-words leading-relaxed max-h-48 overflow-auto">
                        {task.result}
                      </pre>
                    </div>
                  )}

                  {/* Error */}
                  {task.error && (
                    <div>
                      <p className="text-[10px] font-medium text-destructive uppercase tracking-wider mb-1">
                        Error
                      </p>
                      <pre className="font-mono text-xs text-destructive bg-destructive/10 rounded-md p-3 whitespace-pre-wrap break-words leading-relaxed">
                        {task.error}
                      </pre>
                    </div>
                  )}

                  {/* Assigned agents */}
                  {assignedAgents.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                        Assigned Agents
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {assignedAgents.map((agentId, idx) => (
                          <Badge key={idx} variant="outline" className="font-mono text-xs">
                            {agentId}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Related builds */}
                  {relatedBuilds.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                        Related Builds
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {relatedBuilds.map((build) => (
                          <button
                            key={build.id}
                            type="button"
                            onClick={() => handleBuildClick(build.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[var(--color-border-medium)] text-xs font-mono text-[var(--color-text-secondary)] hover:border-[var(--color-border-accent)] hover:text-[var(--color-text-primary)] transition-colors"
                          >
                            <Package className="h-3 w-3" />
                            {build.title || build.id.slice(0, 8)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Task ID */}
                  <p className="font-mono text-[10px] text-[var(--color-text-tertiary)] opacity-60">
                    {task.id}
                  </p>

                  {/* Awaiting input — inline reply */}
                  {canReply && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-medium text-[var(--color-status-warning-dot)] uppercase tracking-wider">
                        Orchestrator needs clarification
                      </p>
                      <Textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleReply();
                          }
                        }}
                        placeholder="Your reply..."
                        rows={2}
                        disabled={replying}
                        className="text-sm resize-none"
                      />
                      {replyError && (
                        <p className="text-xs text-destructive">{replyError}</p>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        disabled={!replyText.trim() || replying}
                        onClick={handleReply}
                        className="gap-1.5"
                      >
                        {replying ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        Send
                      </Button>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {canResume && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={handleResume}
                        className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50"
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Resume
                      </Button>
                    )}
                    {canCancel && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => setShowCancelConfirm(true)}
                        className="font-[family-name:var(--font-body)] text-xs"
                      >
                        {task.status === 'pending' ? 'Cancel' : 'Stop'}
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => setShowDeleteConfirm(true)}
                        className="border-destructive/40 text-destructive hover:bg-destructive/10 gap-1.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </Button>
                    )}
                  </div>

                  {actionError && (
                    <p className="text-xs text-destructive">{actionError}</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title={task.status === 'pending' ? 'Cancel task?' : 'Stop task?'}
        description="The task will be marked as cancelled and any running agents will be stopped."
        confirmLabel={task.status === 'pending' ? 'Cancel task' : 'Stop task'}
        cancelLabel="Keep running"
        variant="destructive"
        onConfirm={handleCancelConfirmed}
        loading={busy}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Remove task?"
        description="This will permanently remove the task from your history."
        confirmLabel="Remove"
        cancelLabel="Keep"
        variant="destructive"
        onConfirm={handleDeleteConfirmed}
        loading={busy}
      />
    </>
  );
}

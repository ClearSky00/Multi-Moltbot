import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Trash2,
  ArrowLeft,
  ExternalLink,
  Bot,
  ClipboardList,
} from "lucide-react";
import useBuildStore from "../store/buildStore";
import useToastStore from "../store/toastStore";
import { deleteBuild as deleteBuildDb } from "../services/db";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import ConfirmDialog from "../components/shared/ConfirmDialog";
import BuildOutput from "../components/builds/BuildOutput";
import BuildListSkeleton from "../components/builds/BuildListSkeleton";

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const pageTransition = {
  duration: 0.42,
  ease: [0.25, 0.46, 0.45, 0.94],
};

const statusConfig = {
  pending: {
    label: "Pending",
    icon: Clock,
    className: "bg-secondary text-secondary-foreground",
    borderColor: "var(--color-border-medium)",
  },
  running: {
    label: "Building",
    icon: Loader2,
    className: "bg-primary text-primary-foreground",
    borderColor: "var(--color-border-accent)",
    spin: true,
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    borderColor: "var(--color-status-success-dot)",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    className: "bg-red-100 text-red-800 border-red-200",
    borderColor: "var(--color-status-error-dot)",
  },
  cancelled: {
    label: "Cancelled",
    icon: AlertCircle,
    className: "bg-muted text-muted-foreground",
    borderColor: "var(--color-border-light)",
  },
  paused: {
    label: "Paused",
    icon: AlertTriangle,
    className: "bg-amber-100 text-amber-800 border-amber-200",
    borderColor: "var(--color-status-warning-dot)",
  },
};

function formatTimestamp(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatElapsed(startedAt, completedAt) {
  const start = startedAt ? new Date(startedAt).getTime() : null;
  if (!start) return "—";
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

function BuildListItem({ build, index, isSelected, onSelect }) {
  const config = statusConfig[build.status] || statusConfig.pending;
  const StatusIcon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.24,
        delay: index * 0.04,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(build.id)}
        className={cn(
          "w-full text-left rounded-lg border p-4 mb-2 transition-all overflow-hidden",
          "hover:shadow-md hover:border-[var(--color-border-medium)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-accent)]",
          isSelected
            ? "border-[var(--color-border-accent)] bg-[var(--color-bg-elevated)] shadow-sm"
            : "border-[var(--color-border-light)] bg-white",
        )}
        style={{ borderLeft: `3px solid ${config.borderColor || 'var(--color-border-light)'}` }}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="font-[var(--font-body)] text-sm font-medium text-[var(--color-text-primary)] leading-snug flex-1 min-w-0 truncate">
            {build.title}
          </h3>
          <Badge className={cn("shrink-0 gap-1 text-[10px]", config.className)}>
            <StatusIcon
              className={cn(
                "h-3 w-3",
                config.spin && "animate-spin",
              )}
            />
            {config.label}
          </Badge>
        </div>

        {build.description && (
          <p className="text-xs text-[var(--color-text-tertiary)] line-clamp-2 mb-2">
            {build.description}
          </p>
        )}

        <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-tertiary)] font-mono">
          {build.agent_id && (
            <span className="flex items-center gap-1">
              <Bot className="h-3 w-3" />
              {build.agent_id}
            </span>
          )}
          <span>{formatTimestamp(build.created_at)}</span>
        </div>
      </button>
    </motion.div>
  );
}

function BuildDetail({ build, onBack, onDelete }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionError, setActionError] = useState("");
  const config = statusConfig[build.status] || statusConfig.pending;
  const StatusIcon = config.icon;

  const handleDeleteConfirmed = async () => {
    setShowDeleteConfirm(false);
    setActionError("");
    setBusy(true);
    // Optimistically remove; get rollback fn from the store action
    const rollback = useBuildStore.getState().removeBuild(build.id);
    onDelete(build.id); // clear selection
    try {
      const result = await deleteBuildDb(build.id);
      if (result?.error) {
        rollback();
        const msg = typeof result.error === "string" ? result.error : "Could not delete build";
        setActionError(msg);
        useToastStore.getState().addToast({ type: "error", title: "Remove failed", message: msg });
        return;
      }
    } catch (err) {
      rollback();
      const msg = err?.message || "Request failed";
      setActionError(msg);
      useToastStore.getState().addToast({ type: "error", title: "Remove failed", message: msg });
    } finally {
      setBusy(false);
    }
  };

  const handleTaskLinkClick = useCallback(() => {
    navigate('/tasks');
  }, [navigate]);

  const metadataEntries =
    build.metadata && typeof build.metadata === "object"
      ? Object.entries(build.metadata).filter(([, v]) => v != null && v !== "")
      : [];

  const isRunning = build.status === "running";

  return (
    <>
      <motion.div
        key={build.id}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -16 }}
        transition={{ duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="flex flex-col h-full"
      >
        <div className="shrink-0 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] -ml-2 mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            All Builds
          </Button>

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-semibold text-[var(--color-text-primary)] tracking-tight mb-1">
                {build.title}
              </h2>
              {build.description && (
                <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                  {build.description}
                </p>
              )}
            </div>
            <Badge className={cn("shrink-0 gap-1.5", config.className)}>
              <StatusIcon
                className={cn(
                  "h-3.5 w-3.5",
                  config.spin && "animate-spin",
                )}
              />
              {config.label}
            </Badge>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-4 pr-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Details
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {build.agent_id && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                        Agent
                      </p>
                      <Badge variant="outline" className="font-mono text-xs">
                        {build.agent_id}
                      </Badge>
                    </div>
                  )}
                  {build.task_id && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                        Task
                      </p>
                      <button
                        type="button"
                        onClick={handleTaskLinkClick}
                        title="View task"
                        className="inline-flex items-center gap-1 font-mono text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:underline transition-colors truncate max-w-[200px]"
                      >
                        <ClipboardList className="h-3 w-3 shrink-0" />
                        {build.task_id.slice(0, 16)}…
                      </button>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                      Created
                    </p>
                    <span className="font-mono text-xs">
                      {formatTimestamp(build.created_at)}
                    </span>
                  </div>
                  {build.started_at && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                        Duration
                      </p>
                      <span className="font-mono text-xs flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatElapsed(build.started_at, build.completed_at)}
                      </span>
                    </div>
                  )}
                </div>

                {build.artifact_url && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        Artifact
                      </p>
                      <a
                        href={build.artifact_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-mono text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {build.artifact_url}
                      </a>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {(build.output || isRunning) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    Output
                    {isRunning && (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <BuildOutput
                    output={build.output}
                    taskId={build.task_id}
                    isRunning={isRunning}
                  />
                </CardContent>
              </Card>
            )}

            {metadataEntries.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Metadata
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <dl className="space-y-2">
                    {metadataEntries.map(([key, value]) => (
                      <div key={key} className="flex items-baseline gap-2">
                        <dt className="font-mono text-xs text-muted-foreground shrink-0">
                          {key}
                        </dt>
                        <dd className="font-mono text-xs text-secondary-foreground break-all">
                          {typeof value === "object"
                            ? JSON.stringify(value)
                            : String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            )}

            <div className="flex items-center justify-between pt-2 pb-4">
              <span className="font-mono text-[10px] text-[var(--color-text-tertiary)] opacity-60">
                {build.id}
              </span>
              <div className="flex flex-col items-end gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => setShowDeleteConfirm(true)}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Remove
                </Button>
                {actionError && (
                  <p className="text-[10px] text-destructive text-right max-w-[220px] leading-tight">
                    {actionError}
                  </p>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </motion.div>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Remove build?"
        description="This will permanently remove the build record from your history."
        confirmLabel="Remove"
        cancelLabel="Keep"
        variant="destructive"
        onConfirm={handleDeleteConfirmed}
        loading={busy}
      />
    </>
  );
}

export default function Builds() {
  const builds = useBuildStore((s) => s.builds);
  const isLoading = useBuildStore((s) => s.isLoading);
  const selectedBuildId = useBuildStore((s) => s.selectedBuildId);
  const fetchBuilds = useBuildStore((s) => s.fetchBuilds);
  const selectBuild = useBuildStore((s) => s.selectBuild);
  const clearSelection = useBuildStore((s) => s.clearSelection);
  const removeBuild = useBuildStore((s) => s.removeBuild);

  useEffect(() => {
    fetchBuilds();
  }, [fetchBuilds]);

  const hasActiveBuilds = useMemo(
    () => builds.some((b) => b.status === "running" || b.status === "pending"),
    [builds],
  );

  useEffect(() => {
    if (!hasActiveBuilds) return undefined;
    const id = setInterval(() => {
      void useBuildStore.getState().fetchBuilds();
    }, 4000);
    return () => clearInterval(id);
  }, [hasActiveBuilds]);

  const visibleBuilds = useMemo(() => {
    return [...builds]
      .filter((b) => b.status !== "cancelled")
      .sort((a, b) => {
        const aTime = new Date(a.created_at || 0).getTime();
        const bTime = new Date(b.created_at || 0).getTime();
        return bTime - aTime;
      });
  }, [builds]);

  const selectedBuild = useMemo(
    () =>
      selectedBuildId
        ? visibleBuilds.find((b) => b.id === selectedBuildId)
        : null,
    [selectedBuildId, visibleBuilds],
  );

  const handleDelete = useCallback(
    (buildId) => {
      removeBuild(buildId);
      clearSelection();
    },
    [removeBuild, clearSelection],
  );

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex flex-col h-full overflow-hidden"
    >
      <AnimatePresence mode="wait">
        {selectedBuild ? (
          <BuildDetail
            key="detail"
            build={selectedBuild}
            onBack={clearSelection}
            onDelete={handleDelete}
          />
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col h-full overflow-hidden"
          >
            <header className="shrink-0 mb-5">
              <div className="flex items-center gap-3 mb-1">
                <Package className="h-6 w-6 text-foreground" />
                <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight">
                  Builds
                </h1>
              </div>
              {!isLoading && (
                <p className="text-sm text-muted-foreground ml-9">
                  {visibleBuilds.length} build
                  {visibleBuilds.length !== 1 ? "s" : ""} shown
                </p>
              )}
            </header>

            <ScrollArea className="flex-1 min-h-0">
              {isLoading ? (
                <div className="pr-4">
                  <BuildListSkeleton />
                </div>
              ) : visibleBuilds.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-4">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <Package className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-foreground mb-1">
                    No builds yet
                  </h3>
                  <p className="text-sm text-muted-foreground text-center max-w-sm">
                    Builds appear here when agents produce compiled artifacts,
                    deploy services, or generate deliverables from tasks.
                  </p>
                </div>
              ) : (
                <div className="pr-4">
                  <AnimatePresence mode="popLayout">
                    {visibleBuilds.map((build, index) => (
                      <BuildListItem
                        key={build.id}
                        build={build}
                        index={index}
                        isSelected={build.id === selectedBuildId}
                        onSelect={selectBuild}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Shimmer loading skeleton that mimics the layout of TaskCard.
 * Uses the same animate-pulse pattern as AgentCardSkeleton.
 */
export default function TaskCardSkeleton() {
  return (
    <div
      className="mb-3 rounded-lg border border-[var(--color-border-light)] bg-white overflow-hidden animate-pulse"
      style={{ borderLeft: '3px solid var(--color-border-light)' }}
    >
      <div className="p-4 pb-3">
        {/* Header row: goal + status badge */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-[var(--color-bg-elevated)] rounded w-3/4" />
            <div className="h-3 bg-[var(--color-bg-elevated)] rounded w-1/2" />
          </div>
          <div className="h-5 w-20 bg-[var(--color-bg-elevated)] rounded-full shrink-0" />
        </div>

        {/* Separator */}
        <div className="h-px bg-[var(--color-border-light)] my-3" />

        {/* Footer row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-3 w-24 bg-[var(--color-bg-elevated)] rounded" />
            <div className="h-3 w-12 bg-[var(--color-bg-elevated)] rounded" />
          </div>
          <div className="h-7 w-16 bg-[var(--color-bg-elevated)] rounded" />
        </div>
      </div>
    </div>
  );
}

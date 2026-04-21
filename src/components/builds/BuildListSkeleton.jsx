/**
 * Shimmer skeleton for the build list. Shows 4 placeholder items
 * while builds are loading on initial mount.
 */
export default function BuildListSkeleton() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="w-full rounded-lg border border-[var(--color-border-light)] bg-white p-4 mb-2 animate-pulse"
        >
          {/* Title row */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="h-3.5 bg-[var(--color-bg-elevated)] rounded flex-1 max-w-[60%]" />
            <div className="h-5 w-16 bg-[var(--color-bg-elevated)] rounded-full shrink-0" />
          </div>
          {/* Description lines */}
          <div className="h-3 bg-[var(--color-bg-elevated)] rounded w-full mb-1.5" />
          <div className="h-3 bg-[var(--color-bg-elevated)] rounded w-3/4 mb-3" />
          {/* Footer */}
          <div className="flex items-center gap-4">
            <div className="h-3 w-20 bg-[var(--color-bg-elevated)] rounded" />
            <div className="h-3 w-16 bg-[var(--color-bg-elevated)] rounded" />
          </div>
        </div>
      ))}
    </>
  );
}

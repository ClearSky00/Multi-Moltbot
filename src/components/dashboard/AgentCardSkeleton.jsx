import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function ShimmerBlock({ className }) {
  return (
    <div
      className={cn(
        "rounded-[3px] animate-pulse",
        "bg-gradient-to-r from-[color:var(--color-bg-elevated)] via-[color:var(--color-bg-surface)] to-[color:var(--color-bg-elevated)]",
        "bg-[length:200px_100%]",
        className,
      )}
    />
  );
}

export default function AgentCardSkeleton({ compact = false }) {
  return (
    <Card className="bg-[color:var(--color-bg-base)] border-[color:var(--color-border-light)] shadow-[var(--shadow-card)]">
      <CardHeader className={cn("pb-1", compact ? "p-3" : "p-4 pb-2")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShimmerBlock className="w-2 h-2 rounded-full" />
            <ShimmerBlock className={compact ? "w-18 h-3" : "w-24 h-[14px]"} />
          </div>
          <ShimmerBlock className={compact ? "w-10 h-4 rounded-md" : "w-12 h-5 rounded-md"} />
        </div>
        <ShimmerBlock className="w-16 h-2.5 mt-1.5" />
      </CardHeader>

      <CardContent className={cn("pt-0", compact ? "px-3 pb-2" : "p-4 pt-0")}>
        <ShimmerBlock className="w-4/5 h-2.5 mb-2" />
        {!compact && <ShimmerBlock className="w-3/5 h-2.5 mb-3" />}
        <div className="flex items-center justify-between mt-1">
          <ShimmerBlock className="w-[50px] h-[9px]" />
        </div>
      </CardContent>
    </Card>
  );
}

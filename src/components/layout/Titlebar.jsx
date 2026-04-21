import { Minus, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  minimizeWindow,
  maximizeWindow,
  closeWindow,
} from "../../services/openclaw";

export default function Titlebar() {
  return (
    <header
      className={cn(
        "drag-region",
        "flex items-center justify-center relative",
        "bg-[var(--color-bg-base)] border-b border-[var(--color-border-light)]",
        "z-[100] select-none",
      )}
      style={{
        height: "var(--titlebar-height)",
        minHeight: "var(--titlebar-height)",
      }}
    >
      <span className="font-mono text-xs uppercase tracking-[0.04em] font-medium text-[var(--color-text-tertiary)]">
        HiveMind OS
      </span>

      <div className="no-drag absolute right-0 top-0 h-full flex items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={minimizeWindow}
          aria-label="Minimize window"
          className={cn(
            "h-full w-[46px] rounded-none",
            "text-[var(--color-text-tertiary)]",
            "hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]",
          )}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={maximizeWindow}
          aria-label="Maximize window"
          className={cn(
            "h-full w-[46px] rounded-none",
            "text-[var(--color-text-tertiary)]",
            "hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]",
          )}
        >
          <Square className="h-3 w-3" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={closeWindow}
          aria-label="Close window"
          className={cn(
            "h-full w-[46px] rounded-none",
            "text-[var(--color-text-tertiary)]",
            "hover:bg-red-600/10 hover:text-red-700",
          )}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>
  );
}

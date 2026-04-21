import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "../shared/LoadingSpinner";
import { cancelOAuthPopup } from "../../services/auth";

/**
 * Shown while Google/GitHub OAuth pop-up is open. modal:false on that window lets
 * the user return here and dismiss with the X (or cancel) without hunting for OS chrome.
 */
export function OAuthPopupDismissBar({ provider }) {
  const show = provider === "google" || provider === "github";
  if (!show) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-14 z-[200] flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border border-[var(--color-border-medium)] bg-[var(--color-bg-base)] px-4 py-2.5 shadow-lg">
        <LoadingSpinner size={18} />
        <p className="flex-1 text-sm text-[var(--color-text-secondary)]">
          Complete sign-in in the pop-up window, or cancel here.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
          onClick={() => void cancelOAuthPopup()}
          aria-label="Cancel sign-in and close pop-up"
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

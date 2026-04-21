import { Button } from "../ui/button";
import LoadingSpinner from "../shared/LoadingSpinner";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className="mr-2">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 1 12c0 1.94.46 3.77 1.18 5.43l3.66-3.34z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function OAuthButtons({ onSelect, loadingProvider }) {
  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          type="button"
          onClick={() => onSelect("google")}
          disabled={!!loadingProvider}
          className="w-full bg-[var(--color-bg-base)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]"
        >
          {loadingProvider === "google" ? (
            <LoadingSpinner size={14} />
          ) : (
            <GoogleIcon />
          )}
          Google
        </Button>
        <Button
          variant="outline"
          type="button"
          onClick={() => onSelect("github")}
          disabled={!!loadingProvider}
          className="w-full bg-[var(--color-bg-base)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]"
        >
          {loadingProvider === "github" ? (
            <LoadingSpinner size={14} />
          ) : (
            <svg
              role="img"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mr-2"
            >
              <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
              <path d="M9 18c-4.51 2-5-2-7-2" />
            </svg>
          )}
          GitHub
        </Button>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-[var(--color-border-light)]" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-[var(--color-bg-base)] px-2 text-[var(--color-text-tertiary)] font-[family-name:var(--font-body)]">
            Or continue with
          </span>
        </div>
      </div>
    </div>
  );
}

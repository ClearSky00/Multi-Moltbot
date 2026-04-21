import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { AuthLayout } from "../../components/auth/AuthLayout";
import LoadingSpinner from "../../components/shared/LoadingSpinner";

/**
 * Thin callback page shown while OAuth / magic-link redirects are processed.
 * The actual deep-link handling (PKCE code exchange, token extraction) lives
 * in the global useAuth hook so it works regardless of which route is active
 * when the deep link arrives.
 *
 * This page simply shows a spinner. If the user is already authenticated
 * (deep link was processed before this page rendered), redirect immediately.
 * If nothing happens after a timeout, redirect to sign in.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const { isAuthenticated, initialized } = useAuth();

  // If session already exists (deep link was handled), redirect to dashboard
  useEffect(() => {
    if (initialized && isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [initialized, isAuthenticated, navigate]);

  // Safety net — if nothing happens within 10s, redirect to sign in
  useEffect(() => {
    const timeout = setTimeout(() => {
      navigate("/auth/signin", { replace: true });
    }, 10000);
    return () => clearTimeout(timeout);
  }, [navigate]);

  return (
    <AuthLayout>
      <div className="flex flex-col items-center justify-center p-12 text-center bg-[var(--color-bg-base)] border border-[var(--color-border-light)] shadow-card rounded-[var(--radius-xl)]">
        <LoadingSpinner size={32} />
        <h2 className="text-lg font-bold text-[var(--color-text-primary)] mt-6 mb-2">
          Authenticating
        </h2>
        <p className="text-sm text-[var(--color-text-tertiary)]">
          Please wait while we log you in...
        </p>
      </div>
    </AuthLayout>
  );
}

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../../hooks/useAuth";
import LoadingSpinner from "../../shared/LoadingSpinner";

export default function RequireAuth() {
  const { isAuthenticated, initialized } = useAuth();
  const location = useLocation();

  if (!initialized) {
    return (
      <div className="flex w-screen h-screen items-center justify-center bg-[var(--color-bg-base)]">
        <div className="flex flex-col items-center gap-4">
          <LoadingSpinner size={32} />
          <p className="text-sm font-[family-name:var(--font-body)] text-[var(--color-text-tertiary)] animate-pulse">
            Initializing workspace...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect unauthenticated users to the sign-in page,
    // preserving the intended destination in the `redirect` query param
    const returnUrl = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth/signin?redirect=${returnUrl}`} replace />;
  }

  return <Outlet />;
}

import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, LogIn, Mail } from "lucide-react";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { OAuthPopupDismissBar } from "../../components/auth/OAuthPopupDismissBar";
import { OAuthButtons } from "../../components/auth/OAuthButtons";
import { PasswordInput } from "../../components/auth/PasswordInput";
import { useAuth } from "../../hooks/useAuth";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import LoadingSpinner from "../../components/shared/LoadingSpinner";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [useMagicLink, setUseMagicLink] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState(null);

  const {
    signIn,
    signInWithOtp,
    signInWithOAuth,
    loading,
    error,
    clearError,
    rateLimitLockout,
  } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("redirect") || "/";

  const isRateLimited = rateLimitLockout > 0;
  const isSubmitDisabled =
    loading || isRateLimited || !email.trim() || (!useMagicLink && !password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();

    if (useMagicLink) {
      setLoadingProvider("magic");
      const { error: otpError } = await signInWithOtp(email);
      setLoadingProvider(null);
      if (!otpError) {
        setMagicLinkSent(true);
      }
    } else {
      setLoadingProvider("email");
      const { error: signInError } = await signIn(email, password);
      setLoadingProvider(null);
      if (!signInError) {
        navigate(returnTo, { replace: true });
      }
    }
  };

  const handleOAuth = async (provider) => {
    clearError();
    setLoadingProvider(provider);
    const { data, error: oauthError } = await signInWithOAuth(provider);
    setLoadingProvider(null);
    if (!oauthError && data?.session) {
      navigate(returnTo, { replace: true });
    }
  };

  return (
    <AuthLayout>
      <OAuthPopupDismissBar provider={loadingProvider} />
      <Card className="border-[var(--color-border-light)] shadow-card">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-2xl font-[family-name:var(--font-display)] text-[var(--color-text-primary)]">
            {useMagicLink ? "Sign in with Link" : "Welcome Back"}
          </CardTitle>
          <CardDescription className="text-sm font-[family-name:var(--font-body)] text-[var(--color-text-secondary)]">
            {useMagicLink
              ? "Enter your email to receive a secure login link."
              : "Sign in to access your HiveMind OS workspace."}
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          {!useMagicLink && (
            <OAuthButtons
              onSelect={handleOAuth}
              loadingProvider={loadingProvider}
            />
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-[var(--color-status-error-bg)] text-[var(--color-status-error-text)] rounded-[var(--radius-md)] text-sm">
              <AlertCircle
                size={16}
                className="mt-0.5 shrink-0 text-[var(--color-status-error-dot)]"
              />
              <span>{error}</span>
            </div>
          )}

          {magicLinkSent ? (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-[var(--color-status-success-bg)] flex items-center justify-center">
                <Mail
                  className="text-[var(--color-status-success-dot)]"
                  size={24}
                />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-medium">Check your email</h3>
                <p className="text-sm text-[var(--color-text-secondary)] px-4">
                  We sent a magic link to{" "}
                  <span className="font-medium">{email}</span>. Click it to sign
                  in.
                </p>
              </div>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setMagicLinkSent(false)}
              >
                Try another method
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className="font-[family-name:var(--font-body)]"
                />
              </div>

              {!useMagicLink && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      to="/auth/forgot-password"
                      className="text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                      tabIndex={-1}
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required={!useMagicLink}
                  />
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitDisabled}
              >
                {loadingProvider === "email" || loadingProvider === "magic" ? (
                  <LoadingSpinner size={16} color="var(--color-text-inverse)" />
                ) : (
                  <LogIn size={16} />
                )}
                <span>
                  {isRateLimited
                    ? `Too many attempts (wait ${Math.ceil(rateLimitLockout / 1000)}s)`
                    : useMagicLink
                      ? "Send Magic Link"
                      : "Sign In"}
                </span>
              </Button>
            </form>
          )}

          {!magicLinkSent && (
            <div className="flex flex-col items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setUseMagicLink(!useMagicLink);
                  clearError();
                }}
                className="text-xs font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                {useMagicLink
                  ? "Sign in with password instead"
                  : "Use a passwordless magic link instead"}
              </button>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-center border-t border-[var(--color-border-light)] pt-4">
          <div className="text-sm text-[var(--color-text-secondary)]">
            Don&apos;t have an account?{" "}
            <Link
              to="/auth/signup"
              className="font-medium text-[var(--color-text-primary)] hover:underline underline-offset-4"
            >
              Sign up
            </Link>
          </div>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}

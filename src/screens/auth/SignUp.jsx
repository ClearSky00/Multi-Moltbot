import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, UserPlus, Mail } from "lucide-react";
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

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [success, setSuccess] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState(null);

  const {
    signUp,
    signInWithOAuth,
    loading,
    error,
    clearError,
    rateLimitLockout,
  } = useAuth();
  const navigate = useNavigate();

  const isRateLimited = rateLimitLockout > 0;
  // Basic validation for the submit button
  const isValid = email.includes("@") && password.length >= 8;
  const isSubmitDisabled = loading || isRateLimited || !isValid;

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    setLoadingProvider("email");

    // Attempt sign up
    const { data, error: signUpError } = await signUp(email, password);
    setLoadingProvider(null);

    if (!signUpError) {
      // If Supabase returned a session (email confirmation disabled), redirect to dashboard
      if (data?.session) {
        navigate("/", { replace: true });
      } else {
        // Email confirmation required — show "check your inbox" message
        setSuccess(true);
      }
    }
  };

  const handleOAuth = async (provider) => {
    clearError();
    setLoadingProvider(provider);
    const { data, error: oauthError } = await signInWithOAuth(provider);
    setLoadingProvider(null);
    if (!oauthError && data?.session) {
      navigate("/", { replace: true });
    }
  };

  return (
    <AuthLayout>
      <OAuthPopupDismissBar provider={loadingProvider} />
      <Card className="border-[var(--color-border-light)] shadow-card">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-2xl font-[family-name:var(--font-display)] text-[var(--color-text-primary)]">
            Create an Account
          </CardTitle>
          <CardDescription className="text-sm font-[family-name:var(--font-body)] text-[var(--color-text-secondary)]">
            Enter your details below to set up your HiveMind workspace.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          {!success && (
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

          {success ? (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-[var(--color-status-success-bg)] flex items-center justify-center">
                <Mail
                  className="text-[var(--color-status-success-dot)]"
                  size={24}
                />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-medium">Verify your email</h3>
                <p className="text-sm text-[var(--color-text-secondary)] px-4">
                  We sent a verification link to{" "}
                  <span className="font-medium">{email}</span>. Please check
                  your inbox.
                </p>
              </div>
              <Button
                variant="outline"
                className="mt-6 w-full"
                onClick={() => navigate("/auth/signin")}
              >
                Return to sign in
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
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  showStrength={true}
                  required
                />
                <p className="text-[10px] text-[var(--color-text-tertiary)]">
                  Must be at least 8 characters. We recommend a mix of numbers,
                  letters, and symbols.
                </p>
              </div>

              <Button
                type="submit"
                className="w-full mt-2"
                disabled={isSubmitDisabled}
              >
                {loadingProvider === "email" ? (
                  <LoadingSpinner size={16} color="var(--color-text-inverse)" />
                ) : (
                  <UserPlus size={16} />
                )}
                <span>
                  {isRateLimited
                    ? `Too many attempts (wait ${Math.ceil(rateLimitLockout / 1000)}s)`
                    : "Create Account"}
                </span>
              </Button>
            </form>
          )}
        </CardContent>

        {!success && (
          <CardFooter className="flex justify-center border-t border-[var(--color-border-light)] pt-4">
            <div className="text-sm text-[var(--color-text-secondary)]">
              Already have an account?{" "}
              <Link
                to="/auth/signin"
                className="font-medium text-[var(--color-text-primary)] hover:underline underline-offset-4"
              >
                Sign in
              </Link>
            </div>
          </CardFooter>
        )}
      </Card>
    </AuthLayout>
  );
}

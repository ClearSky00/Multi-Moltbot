import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, KeyRound, Mail } from "lucide-react";
import { AuthLayout } from "../../components/auth/AuthLayout";
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

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState(false);

  const {
    resetPasswordForEmail,
    loading,
    error,
    clearError,
    rateLimitLockout,
  } = useAuth();

  const isRateLimited = rateLimitLockout > 0;
  const isSubmitDisabled = loading || isRateLimited || !email.trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();

    const { error: resetError } = await resetPasswordForEmail(email);
    if (!resetError) {
      setSuccess(true);
    }
  };

  return (
    <AuthLayout>
      <Card className="border-[var(--color-border-light)] shadow-card">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-2xl font-[family-name:var(--font-display)] text-[var(--color-text-primary)]">
            Reset Password
          </CardTitle>
          <CardDescription className="text-sm font-[family-name:var(--font-body)] text-[var(--color-text-secondary)]">
            Enter your email address to receive a secure password reset link.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
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
                <h3 className="text-base font-medium">Check your inbox</h3>
                <p className="text-sm text-[var(--color-text-secondary)] px-4">
                  We sent a reset link to{" "}
                  <span className="font-medium">{email}</span>. Click it to set
                  a new password.
                </p>
              </div>
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

              <Button
                type="submit"
                className="w-full mt-2"
                disabled={isSubmitDisabled}
              >
                {loading ? (
                  <LoadingSpinner size={16} color="var(--color-text-inverse)" />
                ) : (
                  <KeyRound size={16} />
                )}
                <span>
                  {isRateLimited
                    ? `Too many attempts (wait ${Math.ceil(rateLimitLockout / 1000)}s)`
                    : "Send Reset Link"}
                </span>
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="flex justify-center border-t border-[var(--color-border-light)] pt-4">
          <Link
            to="/auth/signin"
            className="text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            &larr; Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}

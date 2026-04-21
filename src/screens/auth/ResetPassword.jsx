import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { PasswordInput } from "../../components/auth/PasswordInput";
import { useAuth } from "../../hooks/useAuth";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import LoadingSpinner from "../../components/shared/LoadingSpinner";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(3);

  const { updatePassword, loading, error, clearError } = useAuth();
  const navigate = useNavigate();

  // Redirect countdown after success
  useEffect(() => {
    let timer;
    if (success && countdown > 0) {
      timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    } else if (success && countdown === 0) {
      navigate("/auth/signin", { replace: true });
    }
    return () => clearTimeout(timer);
  }, [success, countdown, navigate]);

  const passwordsMatch = password === confirmPassword;
  const isSubmitDisabled = loading || password.length < 8 || !passwordsMatch;

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();

    if (!passwordsMatch) return;

    const { error: resetError } = await updatePassword(password);
    if (!resetError) {
      setSuccess(true);
    }
  };

  return (
    <AuthLayout>
      <Card className="border-[var(--color-border-light)] shadow-card">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-2xl font-[family-name:var(--font-display)] text-[var(--color-text-primary)]">
            Set New Password
          </CardTitle>
          <CardDescription className="text-sm font-[family-name:var(--font-body)] text-[var(--color-text-secondary)]">
            Please enter your new password below.
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
                <ShieldCheck
                  className="text-[var(--color-status-success-dot)]"
                  size={24}
                />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-medium">Password updated</h3>
                <p className="text-sm text-[var(--color-text-secondary)] px-4">
                  Your password has been changed successfully. Redirecting to
                  sign in... ({countdown})
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  showStrength={true}
                  required
                />
              </div>

              <div className="space-y-2 mt-4">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <PasswordInput
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                {!passwordsMatch && confirmPassword && (
                  <p className="text-[10px] text-[var(--color-status-error-dot)] mt-1">
                    Passwords do not match
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full mt-4"
                disabled={isSubmitDisabled}
              >
                {loading ? (
                  <LoadingSpinner size={16} color="var(--color-text-inverse)" />
                ) : (
                  <ShieldCheck size={16} />
                )}
                <span>Update Password</span>
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

import { Link } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import { AuthLayout } from "../../components/auth/AuthLayout";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";

export default function EmailVerified() {
  return (
    <AuthLayout>
      <Card className="border-[var(--color-border-light)] shadow-card">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-2xl font-[family-name:var(--font-display)] text-[var(--color-text-primary)]">
            Email Verified
          </CardTitle>
          <CardDescription className="text-sm font-[family-name:var(--font-body)] text-[var(--color-text-secondary)]">
            Your email address has been confirmed.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-[var(--color-status-success-bg)] flex items-center justify-center">
              <CheckCircle
                className="text-[var(--color-status-success-dot)]"
                size={28}
              />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-medium text-[var(--color-text-primary)]">
                You're all set!
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)] max-w-xs mx-auto">
                Your account has been verified. You can now sign in to access
                your HiveMind OS workspace.
              </p>
            </div>
            <Button asChild className="w-full mt-4">
              <Link to="/auth/signin">Sign in to HiveMind OS</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

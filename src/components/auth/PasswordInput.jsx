import { Eye, EyeOff } from "lucide-react";
import { useState, forwardRef } from "react";
import { Input } from "../ui/input";

export const PasswordInput = forwardRef(
  ({ showStrength = false, value = "", onChange, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    // Simple strength calculation
    const getStrength = (pass) => {
      if (!pass) return { score: 0, label: "", color: "transparent" };
      let score = 0;
      if (pass.length > 7) score++;
      if (pass.length > 10) score++;
      if (/[A-Z]/.test(pass)) score++;
      if (/[0-9]/.test(pass)) score++;
      if (/[^A-Za-z0-9]/.test(pass)) score++;

      if (score < 2)
        return { score, label: "Weak", color: "var(--color-status-error-dot)" };
      if (score < 4)
        return {
          score,
          label: "Fair",
          color: "var(--color-status-warning-dot)",
        };
      return {
        score,
        label: "Strong",
        color: "var(--color-status-success-dot)",
      };
    };

    const strength = getStrength(value);

    return (
      <div className="space-y-1.5">
        <div className="relative">
          <Input
            type={visible ? "text" : "password"}
            value={value}
            onChange={onChange}
            className="pr-9"
            ref={ref}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
            aria-label={visible ? "Hide password" : "Show password"}
          >
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        {showStrength && value && (
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex h-1 flex-1 gap-1">
              {[1, 2, 3].map((segment) => (
                <div
                  key={segment}
                  className="h-full flex-1 rounded-full transition-colors duration-300"
                  style={{
                    backgroundColor:
                      strength.score >=
                      (segment === 1 ? 1 : segment === 2 ? 3 : 4)
                        ? strength.color
                        : "var(--color-border-medium)",
                  }}
                />
              ))}
            </div>
            <span
              className="text-[10px] font-medium font-[family-name:var(--font-body)]"
              style={{ color: strength.color }}
            >
              {strength.label}
            </span>
          </div>
        )}
      </div>
    );
  },
);

PasswordInput.displayName = "PasswordInput";

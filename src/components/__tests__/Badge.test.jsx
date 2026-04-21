import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Badge from "../shared/Badge";

describe("Badge", () => {
  it("renders label text", () => {
    render(<Badge label="Active" />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders default variant", () => {
    render(<Badge label="Default" />);
    const badge = screen.getByText("Default");
    // default variant uses the elevated background
    expect(badge.style.background).toBe("var(--color-bg-elevated)");
    expect(badge.style.color).toBe("var(--color-text-secondary)");
  });

  it("renders success variant", () => {
    render(<Badge label="Success" variant="success" />);
    const badge = screen.getByText("Success");
    expect(badge.style.background).toBe("var(--color-status-success-bg)");
    expect(badge.style.color).toBe("var(--color-status-success-text)");
  });

  it("renders warning variant", () => {
    render(<Badge label="Warning" variant="warning" />);
    const badge = screen.getByText("Warning");
    expect(badge.style.background).toBe("var(--color-status-warning-bg)");
    expect(badge.style.color).toBe("var(--color-status-warning-text)");
  });

  it("renders error variant", () => {
    render(<Badge label="Error" variant="error" />);
    const badge = screen.getByText("Error");
    expect(badge.style.background).toBe("var(--color-status-error-bg)");
    expect(badge.style.color).toBe("var(--color-status-error-text)");
  });
});

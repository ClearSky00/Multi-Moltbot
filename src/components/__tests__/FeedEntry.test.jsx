import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FeedEntry from "../dashboard/FeedEntry";

function renderEntry(overrides = {}) {
  const entry = {
    timestamp: "2026-03-16T14:30:45Z",
    agentName: "Alpha",
    message: "Completed file write to src/index.js",
    type: "info",
    ...overrides,
  };

  return render(<FeedEntry entry={entry} />);
}

describe("FeedEntry", () => {
  it("renders timestamp and agent name", () => {
    renderEntry();

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    // The timestamp is formatted via toLocaleTimeString; just verify a time-like string is present
    const timeEl = screen.getByText((_content, element) => {
      return (
        element?.tagName === "SPAN" &&
        /\d{2}:\d{2}:\d{2}/.test(element.textContent)
      );
    });
    expect(timeEl).toBeInTheDocument();
  });

  it("renders message text", () => {
    renderEntry({ message: "Deployed service successfully" });

    expect(
      screen.getByText("Deployed service successfully"),
    ).toBeInTheDocument();
  });

  it("applies warning styling for security events", () => {
    const { container } = renderEntry({ type: "security" });

    // The outermost motion.div gets the warning background via Tailwind class
    const wrapper = container.firstChild;
    expect(wrapper.className).toContain(
      "bg-[color:var(--color-status-warning-bg)]",
    );
  });

  it("applies error styling for error events", () => {
    const { container } = renderEntry({ type: "error" });

    const wrapper = container.firstChild;
    expect(wrapper.className).toContain(
      "bg-[color:var(--color-status-error-bg)]",
    );
  });
});

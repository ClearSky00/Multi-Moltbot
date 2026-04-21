import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusDot from "../shared/StatusDot";

// framer-motion renders motion.span as a regular span in jsdom
describe("StatusDot", () => {
  it("renders idle dot", () => {
    const { container } = render(<StatusDot status="idle" />);
    const outerSpan = container.firstChild;
    // The outer span wraps the dot
    expect(outerSpan).toBeInTheDocument();
    // idle has exactly one inner span (the dot itself, no pulse)
    const innerSpans = outerSpan.querySelectorAll("span");
    // Only the static dot span (no pulse ring for idle)
    expect(innerSpans.length).toBe(1);
  });

  it("renders running dot with pulse", () => {
    const { container } = render(<StatusDot status="running" />);
    const outerSpan = container.firstChild;
    // running has two inner spans: the pulse ring + the dot
    const innerSpans = outerSpan.querySelectorAll("span");
    expect(innerSpans.length).toBe(2);
  });

  it("renders error dot", () => {
    const { container } = render(<StatusDot status="error" />);
    const outerSpan = container.firstChild;
    expect(outerSpan).toBeInTheDocument();
    // error has no pulse, just the dot
    const innerSpans = outerSpan.querySelectorAll("span");
    expect(innerSpans.length).toBe(1);
  });

  it("renders paused dot", () => {
    const { container } = render(<StatusDot status="paused" />);
    const outerSpan = container.firstChild;
    expect(outerSpan).toBeInTheDocument();
    const innerSpans = outerSpan.querySelectorAll("span");
    expect(innerSpans.length).toBe(1);
  });

  it("renders success dot", () => {
    const { container } = render(<StatusDot status="success" />);
    const outerSpan = container.firstChild;
    expect(outerSpan).toBeInTheDocument();
    const innerSpans = outerSpan.querySelectorAll("span");
    expect(innerSpans.length).toBe(1);
  });
});

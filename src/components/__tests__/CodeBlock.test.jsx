import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CodeBlock from "../shared/CodeBlock";

describe("CodeBlock", () => {
  it("renders code content", () => {
    render(<CodeBlock>console.log("hello")</CodeBlock>);

    expect(screen.getByText('console.log("hello")')).toBeInTheDocument();
  });

  it("applies monospace font", () => {
    const { container } = render(<CodeBlock>const x = 1;</CodeBlock>);

    const pre = container.querySelector("pre");
    expect(pre).toBeInTheDocument();
    expect(pre.style.fontFamily).toBe("var(--font-mono)");
  });
});

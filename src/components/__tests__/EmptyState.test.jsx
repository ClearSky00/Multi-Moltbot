import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmptyState from "../shared/EmptyState";

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(
      <EmptyState
        title="No agents found"
        description="Create your first agent to get started."
      />,
    );

    expect(screen.getByText("No agents found")).toBeInTheDocument();
    expect(
      screen.getByText("Create your first agent to get started."),
    ).toBeInTheDocument();
  });

  it("renders action button when provided", () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        title="Empty"
        description="Nothing here"
        actionLabel="Create Agent"
        onAction={onAction}
      />,
    );

    expect(screen.getByText("Create Agent")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create Agent" }),
    ).toBeInTheDocument();
  });

  it("calls onAction callback when clicked", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <EmptyState
        title="Empty"
        description="Nothing here"
        actionLabel="Add New"
        onAction={onAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add New" }));

    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

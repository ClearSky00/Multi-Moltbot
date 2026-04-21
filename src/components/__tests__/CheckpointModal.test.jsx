import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CheckpointModal from "../security/CheckpointModal";

const mockRespondToCheckpoint = vi.fn();
let mockActiveCheckpoint = null;

vi.mock("../../store/agentStore", () => ({
  useAgentStore: (selector) => {
    const state = {
      activeCheckpoint: mockActiveCheckpoint,
      respondToCheckpoint: mockRespondToCheckpoint,
    };
    return selector(state);
  },
}));

describe("CheckpointModal", () => {
  beforeEach(() => {
    mockRespondToCheckpoint.mockClear();
    mockActiveCheckpoint = null;
  });

  it("does not render when no checkpoint", () => {
    mockActiveCheckpoint = null;
    const { container } = render(<CheckpointModal />);

    // AnimatePresence renders nothing when activeCheckpoint is null
    expect(screen.queryByText("Security Checkpoint")).not.toBeInTheDocument();
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("renders when checkpoint is active", () => {
    mockActiveCheckpoint = {
      id: "cp-1",
      agentName: "Alpha",
      actionType: "file_write",
      action: "Write to /etc/config",
      riskLevel: "high",
    };
    render(<CheckpointModal />);

    expect(screen.getByText("Security Checkpoint")).toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("displays agent name and action", () => {
    mockActiveCheckpoint = {
      id: "cp-2",
      agentName: "Bravo",
      actionType: "shell_exec",
      action: "rm -rf /tmp/cache",
      riskLevel: "critical",
    };
    render(<CheckpointModal />);

    // Agent name appears in the permission text and as a Badge
    expect(
      screen.getByText("Bravo is requesting permission"),
    ).toBeInTheDocument();
    // actionType rendered as a Badge
    expect(screen.getByText("shell_exec")).toBeInTheDocument();
    // The action description in the CodeBlock
    expect(screen.getByText("rm -rf /tmp/cache")).toBeInTheDocument();
  });

  it("approve calls respondToCheckpoint(true)", async () => {
    const user = userEvent.setup();
    mockActiveCheckpoint = {
      id: "cp-3",
      agentName: "Gamma",
      actionType: "api_call",
      action: "POST /deploy",
      riskLevel: "medium",
    };
    render(<CheckpointModal />);

    const approveBtn = screen.getByRole("button", { name: "Approve" });
    await user.click(approveBtn);

    expect(mockRespondToCheckpoint).toHaveBeenCalledWith(true);
  });

  it("reject calls respondToCheckpoint(false)", async () => {
    const user = userEvent.setup();
    mockActiveCheckpoint = {
      id: "cp-4",
      agentName: "Delta",
      actionType: "file_delete",
      action: "Delete /var/data",
      riskLevel: "high",
    };
    render(<CheckpointModal />);

    const rejectBtn = screen.getByRole("button", { name: "Reject" });
    await user.click(rejectBtn);

    expect(mockRespondToCheckpoint).toHaveBeenCalledWith(false);
  });

  it("does not close on Escape", async () => {
    const user = userEvent.setup();
    mockActiveCheckpoint = {
      id: "cp-5",
      agentName: "Epsilon",
      actionType: "network",
      action: "Connect to external API",
      riskLevel: "low",
    };
    render(<CheckpointModal />);

    expect(screen.getByText("Security Checkpoint")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    // Modal should still be visible after Escape -- the component prevents default on Escape
    expect(screen.getByText("Security Checkpoint")).toBeInTheDocument();
    // respondToCheckpoint should not have been called
    expect(mockRespondToCheckpoint).not.toHaveBeenCalled();
  });
});

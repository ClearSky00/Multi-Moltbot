import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GoalInput from "../dashboard/GoalInput";

const mockSubmitGoal = vi.fn().mockResolvedValue({});

vi.mock("../../store/agentStore", () => {
  const useAgentStore = (selector) => {
    const state = {
      submitGoal: mockSubmitGoal,
    };
    return selector(state);
  };
  return { useAgentStore, default: useAgentStore };
});

describe("GoalInput", () => {
  beforeEach(() => {
    mockSubmitGoal.mockClear();
    mockSubmitGoal.mockResolvedValue({});
  });

  it("renders textarea with placeholder", () => {
    render(<GoalInput />);

    const textarea = screen.getByPlaceholderText(
      "What should your agents accomplish?",
    );
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName).toBe("TEXTAREA");
  });

  it("submits on Enter", async () => {
    const user = userEvent.setup();
    render(<GoalInput />);

    const textarea = screen.getByPlaceholderText(
      "What should your agents accomplish?",
    );
    await user.type(textarea, "Build a REST API");
    await user.keyboard("{Enter}");

    expect(mockSubmitGoal).toHaveBeenCalledWith("Build a REST API");
  });

  it("does not submit on Shift+Enter", async () => {
    const user = userEvent.setup();
    render(<GoalInput />);

    const textarea = screen.getByPlaceholderText(
      "What should your agents accomplish?",
    );
    await user.type(textarea, "Line one");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(mockSubmitGoal).not.toHaveBeenCalled();
  });

  it("shows character count", async () => {
    const user = userEvent.setup();
    render(<GoalInput />);

    // Initially shows 0/2000
    expect(screen.getByText("0/2000")).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(
      "What should your agents accomplish?",
    );
    await user.type(textarea, "Hello");

    expect(screen.getByText("5/2000")).toBeInTheDocument();
  });
});

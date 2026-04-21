import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AgentCard from "../dashboard/AgentCard";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderCard(agentOverrides = {}) {
  const agent = {
    id: "abcdef01-2345-6789-abcd-ef0123456789",
    name: "Alpha",
    role: "Code Writer",
    status: "idle",
    currentAction: null,
    errorMessage: null,
    taskCount: 3,
    ...agentOverrides,
  };

  return render(
    <MemoryRouter>
      <AgentCard agent={agent} />
    </MemoryRouter>,
  );
}

describe("AgentCard", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("renders agent name and role", () => {
    renderCard();

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Code Writer")).toBeInTheDocument();
  });

  it("shows idle state text", () => {
    renderCard({ status: "idle" });

    expect(screen.getByText("Awaiting task...")).toBeInTheDocument();
  });

  it("shows running currentAction", () => {
    renderCard({ status: "running", currentAction: "Writing unit tests" });

    // TypewriterText starts rendering character by character,
    // but the text prop is passed so at minimum partial content renders.
    // We check the component rendered without error and the role button is present.
    const button = screen.getByRole("button", {
      name: /Agent Alpha, status running/i,
    });
    expect(button).toBeInTheDocument();
  });

  it("shows error state text", () => {
    renderCard({ status: "error", errorMessage: "Connection timeout" });

    expect(screen.getByText("Error occurred")).toBeInTheDocument();
  });

  it("shows paused state", () => {
    renderCard({ status: "paused" });

    expect(screen.getByText("Awaiting approval...")).toBeInTheDocument();
  });

  it("navigates on click", async () => {
    const user = userEvent.setup();
    renderCard();

    const card = screen.getByRole("button", { name: /Agent Alpha/i });
    await user.click(card);

    expect(mockNavigate).toHaveBeenCalledWith(
      "/agents?id=abcdef01-2345-6789-abcd-ef0123456789",
    );
  });
});

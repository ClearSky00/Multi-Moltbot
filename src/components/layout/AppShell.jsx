import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Titlebar from "./Titlebar";
import Sidebar from "./Sidebar";
import MainContent from "./MainContent";
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';

export default function AppShell() {
  const navigate = useNavigate();

  const focusGoalInput = useCallback(() => {
    // Navigate to dashboard first, then dispatch a focus event
    navigate('/');
    // Small delay to allow route render before dispatching
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('hivemind:focus-goal-input'));
    }, 80);
  }, [navigate]);

  useKeyboardShortcuts([
    {
      key: 'k',
      mod: true,
      action: focusGoalInput,
    },
    {
      key: 'n',
      mod: true,
      action: focusGoalInput,
    },
  ]);

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-[var(--color-bg-base)]">
      <Titlebar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <MainContent />
      </div>
    </div>
  );
}

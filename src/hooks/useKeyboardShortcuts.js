import { useEffect } from 'react';

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Register global keyboard shortcuts.
 *
 * @param {Array<{ key: string, mod?: boolean, shift?: boolean, ignoreInputs?: boolean, action: () => void }>} shortcuts
 *
 * - `mod`: requires Ctrl (Windows/Linux) or Cmd (macOS)
 * - `shift`: requires Shift key
 * - `ignoreInputs`: if false (default), the shortcut fires even when an input is focused.
 *   Set to true to only fire when focus is NOT in an input element.
 *   Escape is always exempt from the input filter unless explicitly overridden.
 */
export default function useKeyboardShortcuts(shortcuts) {
  useEffect(() => {
    if (!shortcuts?.length) return;

    function handler(e) {
      const isMod = e.metaKey || e.ctrlKey;
      const targetIsInput = INPUT_TAGS.has(e.target?.tagName);

      for (const shortcut of shortcuts) {
        const keyMatch = e.key === shortcut.key;
        const modMatch = shortcut.mod ? isMod : !isMod || shortcut.mod === undefined;
        const shiftMatch = shortcut.shift ? e.shiftKey : true;

        if (!keyMatch || !modMatch || !shiftMatch) continue;

        // By default, skip shortcuts when an input is focused.
        // Escape always fires regardless of focus target.
        const skipInInputs = shortcut.ignoreInputs !== false && shortcut.key !== 'Escape';
        if (skipInInputs && targetIsInput) continue;

        e.preventDefault();
        shortcut.action();
        break;
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest('[contenteditable="true"]'));
}

const SHORTCUTS = [
  { keys: 'n', desc: 'New project' },
  { keys: '/', desc: 'Focus search' },
  { keys: 'b', desc: 'Board' },
  { keys: 'd', desc: 'Dashboard' },
  { keys: 'r', desc: 'Weekly review' },
  { keys: 'a', desc: 'Activity' },
  { keys: '?', desc: 'This help' },
] as const;

export function KeyboardShortcuts() {
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const key = e.key;

      if (helpOpen) {
        if (key === 'Escape' || key === '?') {
          e.preventDefault();
          setHelpOpen(false);
        }
        return;
      }

      if (key === '?') {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (key === 'n' || key === 'N') {
        e.preventDefault();
        navigate('/new');
        return;
      }
      if (key === 'b' || key === 'B') {
        e.preventDefault();
        navigate('/board');
        return;
      }
      if (key === 'd' || key === 'D') {
        e.preventDefault();
        navigate('/');
        return;
      }
      if (key === 'r' || key === 'R') {
        e.preventDefault();
        navigate('/review');
        return;
      }
      if (key === 'a' || key === 'A') {
        e.preventDefault();
        navigate('/activity');
        return;
      }
      if (key === '/') {
        e.preventDefault();
        const input = document.getElementById('board-search') as HTMLInputElement | null;
        if (input) {
          if (window.location.pathname !== '/') navigate('/');
          // focus after possible navigation paint
          requestAnimationFrame(() => {
            const el = document.getElementById('board-search') as HTMLInputElement | null;
            el?.focus();
            el?.select();
          });
        } else {
          navigate('/');
          setTimeout(() => {
            const el = document.getElementById('board-search') as HTMLInputElement | null;
            el?.focus();
            el?.select();
          }, 50);
        }
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, helpOpen]);

  if (!helpOpen) return null;

  return (
    <div
      className="shortcut-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcut-help-title"
      onClick={() => setHelpOpen(false)}
    >
      <div className="shortcut-panel" onClick={(e) => e.stopPropagation()}>
        <div className="shortcut-panel-header">
          <h2 id="shortcut-help-title">Keyboard shortcuts</h2>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setHelpOpen(false)}
            aria-label="Close"
          >
            Esc
          </button>
        </div>
        <ul className="shortcut-list">
          {SHORTCUTS.map((s) => (
            <li key={s.keys}>
              <kbd>{s.keys}</kbd>
              <span>{s.desc}</span>
            </li>
          ))}
        </ul>
        <p className="muted shortcut-note">Ignored while typing in fields.</p>
      </div>
    </div>
  );
}

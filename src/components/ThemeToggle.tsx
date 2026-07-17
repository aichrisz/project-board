import { cycleTheme } from '../lib/theme';
import { useProjects } from '../store/ProjectContext';
import type { ThemeMode } from '../types';
import { THEME_LABELS } from '../types';

function themeIcon(mode: ThemeMode): string {
  if (mode === 'light') return '☀';
  if (mode === 'dark') return '☾';
  return '◐';
}

type Props = {
  /** Compact icon button (header) vs full control (settings) */
  variant?: 'icon' | 'select';
};

export function ThemeToggle({ variant = 'icon' }: Props) {
  const { settings, setTheme } = useProjects();
  const mode = settings.theme;

  if (variant === 'select') {
    return (
      <label className="field">
        <span>Theme</span>
        <select
          value={mode}
          onChange={(e) => setTheme(e.target.value as ThemeMode)}
          aria-label="Theme"
        >
          {(Object.keys(THEME_LABELS) as ThemeMode[]).map((key) => (
            <option key={key} value={key}>
              {THEME_LABELS[key]}
            </option>
          ))}
        </select>
        <span className="field-hint">
          System follows your OS light/dark preference.
        </span>
      </label>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-ghost theme-toggle"
      onClick={() => setTheme(cycleTheme(mode))}
      title={`Theme: ${THEME_LABELS[mode]} (click to cycle)`}
      aria-label={`Theme: ${THEME_LABELS[mode]}. Click to cycle.`}
    >
      <span className="theme-toggle-icon" aria-hidden>
        {themeIcon(mode)}
      </span>
      <span className="theme-toggle-label">{THEME_LABELS[mode]}</span>
    </button>
  );
}

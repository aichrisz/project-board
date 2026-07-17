import type { ThemeMode } from '../types';

export type ResolvedTheme = 'dark' | 'light';

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'dark' || mode === 'light') return mode;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  }
  return 'dark';
}

export function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

export function cycleTheme(mode: ThemeMode): ThemeMode {
  if (mode === 'system') return 'dark';
  if (mode === 'dark') return 'light';
  return 'system';
}

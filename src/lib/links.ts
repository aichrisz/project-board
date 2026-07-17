/** Classify a stored link URL for safe open vs copy-only. */

export type LinkKind = 'external' | 'path' | 'blocked';

export function classifyLinkUrl(url: string): LinkKind {
  const trimmed = url.trim();
  if (!trimmed) return 'blocked';

  const lower = trimmed.toLowerCase();
  // Block dangerous schemes
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:')
  ) {
    return 'blocked';
  }

  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return 'external';
  }

  // Absolute paths, home paths, file://, or bare path-like (no scheme)
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('~/') ||
    lower.startsWith('file:') ||
    !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  ) {
    return 'path';
  }

  // Other schemes (mailto, etc.) — treat as blocked for open-in-new-tab
  return 'blocked';
}

export function isSafeExternalUrl(url: string): boolean {
  return classifyLinkUrl(url) === 'external';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

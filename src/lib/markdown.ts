/**
 * Safe markdown subset → HTML string (no raw HTML pass-through).
 * Supports: **bold**, *italic*, `code`, [links](url), lists (- / * / 1.)
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeHref(url: string): string | null {
  const t = url.trim();
  if (/^https?:\/\//i.test(t)) return t;
  if (/^mailto:/i.test(t)) return t;
  return null;
}

/** Inline formatting on already-escaped text (placeholders use markers). */
function formatInline(escaped: string): string {
  // code first so content is not re-processed
  let s = escaped.replace(/`([^`]+)`/g, (_m, code: string) => {
    return `<code>${code}</code>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, href: string) => {
    // href text was already HTML-escaped with the line; undo for protocol check
    const raw = href
      .replace(/&quot;/g, '"')
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&amp;/g, '&');
    const safe = safeHref(raw);
    if (!safe) return label;
    return `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  return s;
}

export function renderMarkdownSafe(src: string): string {
  if (!src.trim()) return '';

  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // unordered list
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        const text = lines[i].trim().replace(/^[-*]\s+/, '');
        items.push(`<li>${formatInline(escapeHtml(text))}</li>`);
        i += 1;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const text = lines[i].trim().replace(/^\d+\.\s+/, '');
        items.push(`<li>${formatInline(escapeHtml(text))}</li>`);
        i += 1;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // paragraph (merge consecutive non-empty non-list lines)
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim())
    ) {
      para.push(escapeHtml(lines[i].trim()));
      i += 1;
    }
    out.push(`<p>${formatInline(para.join(' '))}</p>`);
  }

  return out.join('');
}

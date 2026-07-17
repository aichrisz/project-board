import { useState } from 'react';
import type { LinkItem } from '../types';
import { classifyLinkUrl, copyText } from '../lib/links';

type Props = {
  links: LinkItem[];
  /** Max chips to show (omit for all). */
  max?: number;
  /** Show remove control (detail view). */
  onRemove?: (linkId: string) => void;
  /** Compact style for cards. */
  compact?: boolean;
};

export function LinkChips({ links, max, onRemove, compact }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  if (links.length === 0) return null;

  const visible = max != null ? links.slice(0, max) : links;
  const extra = max != null ? Math.max(0, links.length - max) : 0;

  async function handleCopy(link: LinkItem) {
    const ok = await copyText(link.url);
    if (ok) {
      setCopiedId(link.id);
      window.setTimeout(() => {
        setCopiedId((id) => (id === link.id ? null : id));
      }, 1500);
    }
  }

  return (
    <ul
      className={`link-chips${compact ? ' link-chips-compact' : ''}`}
      aria-label="Project links"
    >
      {visible.map((link) => {
        const kind = classifyLinkUrl(link.url);
        const isExternal = kind === 'external';
        const isPath = kind === 'path';
        const label = link.label.trim() || link.url;

        return (
          <li key={link.id} className={`link-chip kind-${kind}`}>
            {isExternal ? (
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="link-chip-main"
                title={link.url}
              >
                <span className="link-chip-icon" aria-hidden>
                  ↗
                </span>
                <span className="link-chip-label">{label}</span>
              </a>
            ) : (
              <span
                className="link-chip-main link-chip-path"
                title={
                  isPath
                    ? 'Local path — copy only'
                    : 'Unsafe or unsupported URL'
                }
              >
                <span className="link-chip-icon" aria-hidden>
                  {isPath ? '📁' : '⚠'}
                </span>
                <span className="link-chip-label">{label}</span>
              </span>
            )}
            {(isPath || kind === 'blocked') && (
              <button
                type="button"
                className="btn-icon link-chip-copy"
                aria-label={
                  copiedId === link.id
                    ? `Copied ${label}`
                    : `Copy path ${label}`
                }
                title={copiedId === link.id ? 'Copied' : 'Copy path'}
                onClick={() => void handleCopy(link)}
              >
                {copiedId === link.id ? '✓' : '⎘'}
              </button>
            )}
            {onRemove && (
              <button
                type="button"
                className="btn-icon link-chip-remove"
                aria-label={`Remove link ${label}`}
                onClick={() => onRemove(link.id)}
              >
                ×
              </button>
            )}
          </li>
        );
      })}
      {extra > 0 && (
        <li className="link-chip link-chip-more muted">+{extra}</li>
      )}
    </ul>
  );
}

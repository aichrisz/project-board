import type { Project } from '../types';
import { computeStats } from './stats';
import { STATUS_LABELS } from '../types';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function weekLabel(d = new Date()): string {
  const start = new Date(d);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (x: Date) =>
    x.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Open a print-friendly weekly snapshot window (KPI + active titles). */
export function openWeeklySnapshot(projects: Project[]): void {
  const stats = computeStats(projects);
  const active = projects
    .filter((p) => p.status !== 'done' && p.status !== 'archived')
    .sort((a, b) => a.title.localeCompare(b.title));

  const rows = active
    .map(
      (p) =>
        `<li><strong>${escapeHtml(p.title)}</strong> <span class="muted">${escapeHtml(STATUS_LABELS[p.status])} · ${p.progress_pct}%</span></li>`,
    )
    .join('');

  const generated = new Date().toLocaleString();
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Project Board — Weekly snapshot</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 32px; color: #152033; background: #fff; max-width: 640px; margin-inline: auto; }
    h1 { font-size: 1.35rem; margin: 0 0 4px; }
    .sub { color: #5a6b84; margin: 0 0 24px; font-size: 0.95rem; }
    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 28px; }
    .kpi { border: 1px solid #d5dce8; border-radius: 10px; padding: 12px 14px; }
    .kpi .n { font-size: 1.5rem; font-weight: 700; }
    .kpi .l { font-size: 0.8rem; color: #5a6b84; text-transform: uppercase; letter-spacing: 0.04em; }
    h2 { font-size: 1rem; margin: 0 0 12px; }
    ul { margin: 0; padding-left: 1.2em; }
    li { margin-bottom: 8px; line-height: 1.4; }
    .muted { color: #5a6b84; font-weight: 400; font-size: 0.9em; }
    .actions { margin-top: 28px; display: flex; gap: 8px; }
    button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid #b8c3d6; background: #f4f6fa; cursor: pointer; }
    button.primary { background: #3b6fe0; color: #fff; border-color: #3b6fe0; }
    @media print {
      .actions { display: none; }
      body { padding: 16px; }
    }
  </style>
</head>
<body>
  <h1>Project Board</h1>
  <p class="sub">Weekly snapshot · ${escapeHtml(weekLabel())}<br />Generated ${escapeHtml(generated)}</p>
  <div class="kpis">
    <div class="kpi"><div class="n">${stats.total}</div><div class="l">Total</div></div>
    <div class="kpi"><div class="n">${stats.active}</div><div class="l">Active</div></div>
    <div class="kpi"><div class="n">${stats.ideas}</div><div class="l">Ideas</div></div>
    <div class="kpi"><div class="n">${stats.overdue}</div><div class="l">Overdue</div></div>
    <div class="kpi"><div class="n">${stats.completed}</div><div class="l">Completed</div></div>
    <div class="kpi"><div class="n">${active.length}</div><div class="l">Listed</div></div>
  </div>
  <h2>Active projects</h2>
  ${active.length ? `<ul>${rows}</ul>` : '<p class="muted">No active projects.</p>'}
  <div class="actions">
    <button type="button" class="primary" onclick="window.print()">Print / Save as PDF</button>
    <button type="button" onclick="window.close()">Close</button>
  </div>
</body>
</html>`;

  const w = window.open('', '_blank', 'noopener,noreferrer,width=720,height=900');
  if (!w) {
    window.alert('Pop-up blocked. Allow pop-ups to open the weekly snapshot.');
    return;
  }
  w.document.write(html);
  w.document.close();
}

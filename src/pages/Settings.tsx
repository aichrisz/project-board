import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';
import {
  formatExportAbsolute,
  formatExportRelative,
  isExportStale,
} from '../lib/exportAge';
import {
  parseImportJson,
  summarizeImport,
  type ImportSummary,
} from '../lib/export';
import {
  computeHygieneCounts,
  formatHygieneReport,
  getNoStepsProjects,
} from '../lib/hygiene';
import { openWeeklySnapshot } from '../lib/snapshot';
import { useProjects } from '../store/ProjectContext';
import type { StorageBlob } from '../types';

export function Settings() {
  const {
    projects,
    settings,
    setShowCompleted,
    setIdleDays,
    exportData,
    importData,
    loadSeed,
    resetAll,
    softArchiveIdle,
  } = useProjects();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportSummary | null>(
    null,
  );
  const [importRaw, setImportRaw] = useState<string | null>(null);
  const [applySettingsOnMerge, setApplySettingsOnMerge] = useState(false);
  const [copyOk, setCopyOk] = useState(false);

  const exportStale = isExportStale(settings.lastExportAt);
  const lastExportRelative = formatExportRelative(settings.lastExportAt);
  const lastExportAbsolute = formatExportAbsolute(settings.lastExportAt);

  const hygieneCounts = useMemo(
    () => computeHygieneCounts(projects, settings.idleDays),
    [projects, settings.idleDays],
  );
  const noStepsList = useMemo(
    () => getNoStepsProjects(projects),
    [projects],
  );

  async function handleImportFile(file: File) {
    setError(null);
    setMessage(null);
    setImportPreview(null);
    setImportRaw(null);
    try {
      const text = await file.text();
      const incoming = parseImportJson(text);
      const current: StorageBlob = {
        version: 1,
        projects,
        settings,
      };
      const summary = summarizeImport(current, incoming);
      setImportPreview(summary);
      setImportRaw(text);
      setApplySettingsOnMerge(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
  }

  function closeImportPreview() {
    setImportPreview(null);
    setImportRaw(null);
    setApplySettingsOnMerge(false);
  }

  function applyImport(mode: 'replace' | 'merge') {
    if (!importRaw) return;
    try {
      importData(importRaw, {
        mode,
        applySettings: mode === 'replace' ? true : applySettingsOnMerge,
      });
      setMessage(
        mode === 'replace'
          ? 'Import successful. Board replaced from JSON.'
          : applySettingsOnMerge
            ? 'Merge import successful (settings applied).'
            : 'Merge import successful (existing ids kept; settings unchanged).',
      );
      closeImportPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
  }

  async function copyHygieneReport() {
    const report = formatHygieneReport(projects, settings.idleDays);
    try {
      await navigator.clipboard.writeText(report);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 2000);
    } catch {
      // Fallback for environments without clipboard API
      window.prompt('Copy hygiene report:', report);
    }
  }

  function handleSoftArchiveIdle() {
    if (hygieneCounts.idleInProgress === 0) return;
    if (
      !window.confirm(
        `Soft-archive ${hygieneCounts.idleInProgress} idle in-progress project${hygieneCounts.idleInProgress === 1 ? '' : 's'}? They move to Archived (not deleted).`,
      )
    ) {
      return;
    }
    const n = softArchiveIdle();
    setMessage(
      n > 0
        ? `Soft-archived ${n} idle project${n === 1 ? '' : 's'}.`
        : 'No idle projects to archive.',
    );
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">
          Local-first preferences. Data stays in this browser (
          <code>project-board-v1</code>).
        </p>
      </div>

      {message && <p className="banner success">{message}</p>}
      {error && <p className="banner error">{error}</p>}

      <section className="panel">
        <h2 className="panel-title">Appearance</h2>
        <ThemeToggle variant="select" />
      </section>

      <section className="panel">
        <h2 className="panel-title">Display</h2>
        <p className="muted">
          Use <strong>Dashboard</strong> for filters, sort, and KPI cards. Use{' '}
          <strong>Board</strong> for a kanban view by status (drag cards to change
          status). Use <strong>Review</strong> for the weekly ritual. Done and
          archived columns appear on the board only when Show completed is
          enabled.
        </p>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
          />
          <span>Show completed (done &amp; archived) by default</span>
        </label>
        <label className="field">
          <span>Idle threshold (days)</span>
          <input
            type="number"
            min={1}
            max={90}
            value={settings.idleDays}
            onChange={(e) => setIdleDays(Number(e.target.value))}
          />
          <span className="field-hint">
            In-progress projects not updated within this many days show an Idle
            badge.
          </span>
        </label>
      </section>

      <section className="panel">
        <h2 className="panel-title">Hygiene</h2>
        <p className="muted">
          Soft cleanup helpers. Nothing is hard-deleted here — archive only moves
          status.
        </p>
        <ul className="hygiene-counts">
          <li>
            <strong>No steps (active):</strong> {hygieneCounts.noSteps}
          </li>
          <li>
            <strong>Idle in progress:</strong> {hygieneCounts.idleInProgress}
          </li>
          <li>
            <strong>Overdue:</strong> {hygieneCounts.overdue}
          </li>
          <li>
            <strong>Empty tags (active):</strong> {hygieneCounts.emptyTags}
          </li>
        </ul>
        <div className="settings-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={hygieneCounts.idleInProgress === 0}
            onClick={handleSoftArchiveIdle}
          >
            Soft-archive all idle in progress
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void copyHygieneReport()}
          >
            {copyOk ? 'Copied' : 'Copy hygiene report'}
          </button>
          <Link to="/review" className="btn btn-ghost">
            Open weekly review
          </Link>
        </div>
        {noStepsList.length > 0 && (
          <div className="hygiene-no-steps">
            <h3 className="hygiene-subhead">No steps</h3>
            <ul className="review-project-list">
              {noStepsList.map((p) => (
                <li key={p.id}>
                  <Link to={`/project/${p.id}`} className="review-project-link">
                    <span className="review-project-title">{p.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="panel-title">Weekly snapshot</h2>
        <p className="muted">
          Printable share card with KPI counts and active project titles for this
          week. Use Print / Save as PDF in the snapshot window.
        </p>
        <div className="settings-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => openWeeklySnapshot(projects)}
          >
            Open weekly snapshot
          </button>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">Backup</h2>
        <p className="muted">
          Export regularly so clearing browser storage does not lose your board.
          Import shows a preview before anything is applied.
        </p>
        <p className="backup-last-export">
          <strong>Last export:</strong>{' '}
          {settings.lastExportAt ? (
            <>
              {lastExportRelative}
              {lastExportAbsolute ? (
                <span className="muted"> ({lastExportAbsolute})</span>
              ) : null}
            </>
          ) : (
            'Never'
          )}
        </p>
        {exportStale && (
          <p className="banner banner-nudge-inline" role="status">
            Export a backup so clearing browser storage does not lose your board.
          </p>
        )}
        <div className="settings-actions">
          <button type="button" className="btn btn-primary" onClick={exportData}>
            Export JSON
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileRef.current?.click()}
          >
            Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = '';
            }}
          />
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">Seed data</h2>
        <p className="muted">
          Load realistic inventory — a template of projects that mirror the side
          projects on this host (games under <code>/root/projects/*</code>, vault
          ops, learning). Merge keeps your existing ids; replace overwrites the
          list.
        </p>
        <div className="settings-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              loadSeed('merge');
              setMessage('Realistic inventory merged (existing ids kept).');
            }}
          >
            Load realistic inventory (merge)
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              if (
                window.confirm(
                  'Replace all projects with the realistic inventory? Your current list will be overwritten.',
                )
              ) {
                loadSeed('replace');
                setMessage('Replaced with realistic inventory.');
              }
            }}
          >
            Load realistic inventory (replace)
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (
                window.confirm(
                  'Reset board to realistic inventory + default settings?',
                )
              ) {
                resetAll();
                setMessage('Board reset to realistic inventory defaults.');
              }
            }}
          >
            Reset board
          </button>
        </div>
      </section>

      {importPreview && (
        <div
          className="import-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-preview-title"
          onClick={closeImportPreview}
        >
          <div
            className="import-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="import-panel-header">
              <h2 id="import-preview-title">Import preview</h2>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={closeImportPreview}
                aria-label="Cancel import"
              >
                Cancel
              </button>
            </div>
            <ul className="import-summary-list">
              <li>
                <strong>Current projects:</strong> {importPreview.currentCount}
              </li>
              <li>
                <strong>Import projects:</strong> {importPreview.importCount}
              </li>
              <li>
                <strong>New ids:</strong> {importPreview.newIds}
              </li>
              <li>
                <strong>Overlapping ids:</strong> {importPreview.overlappingIds}
              </li>
              <li>
                <strong>Settings keys that would change:</strong>{' '}
                {importPreview.settingsKeysChanging.length > 0
                  ? importPreview.settingsKeysChanging.join(', ')
                  : 'none'}
              </li>
            </ul>
            {importPreview.sampleTitles.length > 0 && (
              <div className="import-samples">
                <h3 className="hygiene-subhead">Sample titles</h3>
                <ol>
                  {importPreview.sampleTitles.map((t, i) => (
                    <li key={`${i}-${t}`}>{t}</li>
                  ))}
                </ol>
              </div>
            )}
            <label className="toggle import-settings-toggle">
              <input
                type="checkbox"
                checked={applySettingsOnMerge}
                onChange={(e) => setApplySettingsOnMerge(e.target.checked)}
              />
              <span>Apply settings when merging (replace always applies settings)</span>
            </label>
            <div className="settings-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={closeImportPreview}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => applyImport('merge')}
              >
                Merge by id
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (
                    window.confirm(
                      'Replace all projects and settings with the import file?',
                    )
                  ) {
                    applyImport('replace');
                  }
                }}
              >
                Replace all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_IMPORT_BYTES,
  ImportValidationError,
  parseImportJson,
  readImportFileText,
  summarizeImport,
  toExportJson,
} from './export';
import { DEFAULT_SETTINGS } from '../types';
import type { FocusState, Project, StorageBlob } from '../types';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    title: 'Alpha',
    slug: 'alpha',
    type: 'tool',
    status: 'in_progress',
    summary: 'A test project',
    progress_pct: 50,
    steps: [{ id: 's1', title: 'First', done: true, order: 0 }],
    notes_md: '# notes',
    links: [{ id: 'l1', label: 'Repo', url: 'https://example.com' }],
    tags: ['cli'],
    deadline: null,
    stack: ['ts'],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    started_at: null,
    starred: false,
    ...overrides,
  };
}

function makeBlob(projects: Project[] = [makeProject()]): StorageBlob {
  return { version: 1, projects, settings: { ...DEFAULT_SETTINGS } };
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

describe('parseImportJson — valid input', () => {
  it('round-trips a valid v1 export', () => {
    const blob = makeBlob();
    const parsed = parseImportJson(toExportJson(blob));
    assert.equal(parsed.version, 1);
    assert.equal(parsed.projects.length, 1);
    assert.equal(parsed.projects[0].title, 'Alpha');
    assert.equal(parsed.projects[0].progress_pct, 100);
    assert.deepEqual(parsed.settings, { ...DEFAULT_SETTINGS });
  });

  it('migrates additive legacy fields with safe defaults', () => {
    const legacy = makeProject();
    delete (legacy as Partial<Project>).starred;
    delete (legacy as Partial<Project>).started_at;
    const parsed = parseImportJson(json(makeBlob([legacy])));
    assert.equal(parsed.projects[0].starred, false);
  });

  it('accepts an empty project list', () => {
    const parsed = parseImportJson(json(makeBlob([])));
    assert.deepEqual(parsed.projects, []);
  });

  it('keeps unknown settings keys out of the result', () => {
    const raw = {
      version: 1,
      projects: [],
      settings: { ...DEFAULT_SETTINGS, sneaky: 'value' },
    };
    const parsed = parseImportJson(json(raw));
    assert.deepEqual(Object.keys(parsed.settings).sort(), [
      'idleDays',
      'lastExportAt',
      'showCompleted',
      'theme',
    ]);
  });
});

describe('parseImportJson — root and size guards', () => {
  it('rejects files above the documented byte cap', () => {
    const padded = makeBlob([
      makeProject({ notes_md: 'x'.repeat(MAX_IMPORT_BYTES) }),
    ]);
    assert.throws(() => parseImportJson(json(padded)), /too large/i);
  });

  it('documents a sane byte cap', () => {
    assert.ok(MAX_IMPORT_BYTES >= 1_000_000);
    assert.ok(MAX_IMPORT_BYTES <= 20_000_000);
  });

  it('measures the cap in UTF-8 bytes, not string length', () => {
    // Each "の" is 3 UTF-8 bytes, so this string is under the cap by
    // JS string length but well over it in real bytes.
    const multibyte = 'の'.repeat(Math.ceil(MAX_IMPORT_BYTES / 2));
    assert.ok(multibyte.length < MAX_IMPORT_BYTES);
    assert.ok(Buffer.byteLength(multibyte, 'utf8') > MAX_IMPORT_BYTES);
    assert.throws(
      () => parseImportJson(json(makeBlob([makeProject({ notes_md: multibyte })]))),
      /too large/i,
    );
  });

  it('still accepts multibyte content that fits within the byte cap', () => {
    const notes = 'の'.repeat(1000);
    const parsed = parseImportJson(
      json(makeBlob([makeProject({ notes_md: notes })])),
    );
    assert.equal(parsed.projects[0].notes_md, notes);
  });
});

describe('readImportFileText — File size boundary', () => {
  type FakeFile = { size: number; text: () => Promise<string> };

  function fakeFile(size: number, contents = '{}'): FakeFile & { calls: number } {
    const file = {
      size,
      calls: 0,
      text() {
        file.calls += 1;
        return Promise.resolve(contents);
      },
    };
    return file;
  }

  it('rejects an oversized File without calling text()', async () => {
    const file = fakeFile(MAX_IMPORT_BYTES + 1);
    await assert.rejects(
      () => readImportFileText(file as unknown as File),
      (err: unknown) => {
        assert.ok(err instanceof ImportValidationError);
        assert.match(err.message, /too large/i);
        return true;
      },
    );
    assert.equal(file.calls, 0, 'text() must not be called for oversized files');
  });

  it('reads a File that is within the byte cap', async () => {
    const file = fakeFile(10, '{"ok":true}');
    assert.equal(await readImportFileText(file as unknown as File), '{"ok":true}');
    assert.equal(file.calls, 1);
  });

  it('reads a File exactly at the byte cap', async () => {
    const file = fakeFile(MAX_IMPORT_BYTES, '{}');
    assert.equal(await readImportFileText(file as unknown as File), '{}');
    assert.equal(file.calls, 1);
  });

  it('rejects invalid JSON with a user-safe message', () => {
    assert.throws(
      () => parseImportJson('{ not json'),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /not valid JSON/i);
        assert.doesNotMatch(err.message, /at position|JSON\.parse|token/i);
        return true;
      },
    );
  });

  it('rejects non-object roots', () => {
    for (const raw of ['null', '[]', '42', '"text"', 'true']) {
      assert.throws(() => parseImportJson(raw), /expected an object/i);
    }
  });

  it('rejects unsupported versions', () => {
    assert.throws(
      () => parseImportJson(json({ version: 2, projects: [] })),
      /version/i,
    );
  });

  it('rejects a non-array projects field', () => {
    assert.throws(
      () => parseImportJson(json({ version: 1, projects: {} })),
      /"projects" must be an array/i,
    );
  });

  it('rejects non-object settings', () => {
    assert.throws(
      () => parseImportJson(json({ version: 1, projects: [], settings: [] })),
      /settings/i,
    );
  });
});

describe('parseImportJson — project shape guards', () => {
  it('rejects non-object project entries', () => {
    assert.throws(
      () => parseImportJson(json({ version: 1, projects: ['nope'] })),
      /Project 1/i,
    );
  });

  it('rejects a blank id', () => {
    assert.throws(
      () => parseImportJson(json(makeBlob([makeProject({ id: '   ' })]))),
      /id/i,
    );
  });

  it('rejects a missing title', () => {
    const p = makeProject();
    delete (p as Partial<Project>).title;
    assert.throws(() => parseImportJson(json(makeBlob([p]))), /title/i);
  });

  it('rejects duplicate ids', () => {
    assert.throws(
      () =>
        parseImportJson(
          json(makeBlob([makeProject(), makeProject({ title: 'Beta' })])),
        ),
      /duplicate/i,
    );
  });

  it('rejects unsafe status values', () => {
    assert.throws(
      () =>
        parseImportJson(
          json(makeBlob([makeProject({ status: 'hacked' as never })])),
        ),
      /status/i,
    );
  });

  it('rejects unsafe type values', () => {
    assert.throws(
      () =>
        parseImportJson(
          json(makeBlob([makeProject({ type: '__proto__' as never })])),
        ),
      /type/i,
    );
  });

  it('rejects out-of-range progress', () => {
    for (const value of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(
        () =>
          parseImportJson(
            json(makeBlob([makeProject({ progress_pct: value, steps: [] })])),
          ),
        /progress/i,
      );
    }
  });

  it('rejects invalid timestamps', () => {
    assert.throws(
      () =>
        parseImportJson(
          json(makeBlob([makeProject({ created_at: 'yesterday' })])),
        ),
      /created_at/i,
    );
    assert.throws(
      () =>
        parseImportJson(json(makeBlob([makeProject({ deadline: '13/32' })]))),
      /deadline/i,
    );
  });

  it('rejects impossible calendar dates that Date.parse would normalize', () => {
    for (const value of [
      '2026-02-30',
      '2026-02-31',
      '2025-02-29',
      '2026-04-31',
      '2026-06-31',
      '2026-13-01',
      '2026-00-10',
      '2026-01-00',
      '2026-01-32',
    ]) {
      assert.throws(
        () => parseImportJson(json(makeBlob([makeProject({ deadline: value })]))),
        /deadline/i,
        `expected ${value} to be rejected`,
      );
    }
  });

  it('rejects impossible calendar dates inside ISO timestamps', () => {
    for (const value of [
      '2026-02-30T00:00:00.000Z',
      '2026-11-31T12:00:00.000Z',
      '2027-02-29T08:30:00Z',
    ]) {
      assert.throws(
        () =>
          parseImportJson(json(makeBlob([makeProject({ created_at: value })]))),
        /created_at/i,
        `expected ${value} to be rejected`,
      );
    }
  });

  it('keeps accepting valid v1 export date formats', () => {
    for (const value of [
      '2026-07-20',
      '2024-02-29',
      '2000-02-29',
      '2026-12-31',
      '2026-01-01T00:00:00.000Z',
      '2026-06-30T23:59:59Z',
      '2026-03-15T10:20:30+02:00',
      '2026-03-15T10:20:30.123-05:00',
    ]) {
      const parsed = parseImportJson(
        json(
          makeBlob([
            makeProject({ deadline: value, created_at: '2026-01-01T00:00:00.000Z' }),
          ]),
        ),
      );
      assert.equal(parsed.projects[0].deadline, value, `expected ${value} to pass`);
    }
  });

  it('rejects impossible calendar dates in settings timestamps', () => {
    assert.throws(
      () =>
        parseImportJson(
          json({
            version: 1,
            projects: [],
            settings: { lastExportAt: '2026-02-30T00:00:00.000Z' },
          }),
        ),
      /lastExportAt/i,
    );
  });

  it('rejects non-string tags and stack entries', () => {
    assert.throws(
      () =>
        parseImportJson(json(makeBlob([makeProject({ tags: [1 as never] })]))),
      /tags/i,
    );
    assert.throws(
      () =>
        parseImportJson(json(makeBlob([makeProject({ stack: [{} as never] })]))),
      /stack/i,
    );
  });

  it('rejects malformed steps', () => {
    assert.throws(
      () => parseImportJson(json(makeBlob([makeProject({ steps: [null as never] })]))),
      /step/i,
    );
    assert.throws(
      () =>
        parseImportJson(
          json(
            makeBlob([
              makeProject({
                steps: [{ id: 's1', title: 'x', done: 'yes' as never, order: 0 }],
              }),
            ]),
          ),
        ),
      /done/i,
    );
    assert.throws(
      () =>
        parseImportJson(
          json(
            makeBlob([
              makeProject({
                steps: [
                  { id: 's1', title: 'a', done: false, order: 0 },
                  { id: 's1', title: 'b', done: false, order: 1 },
                ],
              }),
            ]),
          ),
        ),
      /duplicate/i,
    );
  });

  it('rejects malformed links', () => {
    assert.throws(
      () =>
        parseImportJson(
          json(makeBlob([makeProject({ links: ['https://x' as never] })])),
        ),
      /link/i,
    );
    assert.throws(
      () =>
        parseImportJson(
          json(
            makeBlob([
              makeProject({ links: [{ id: 'l1', label: 'x', url: '  ' }] }),
            ]),
          ),
        ),
      /url/i,
    );
  });

  it('rejects oversized text fields', () => {
    assert.throws(
      () =>
        parseImportJson(json(makeBlob([makeProject({ title: 'x'.repeat(5000) })]))),
      /title/i,
    );
  });

  it('rejects too many projects', () => {
    const many = Array.from({ length: 5001 }, (_, i) =>
      makeProject({ id: `p${i}`, slug: `p${i}` }),
    );
    assert.throws(() => parseImportJson(json(makeBlob(many))), /too many/i);
  });

  it('never leaks stack traces or internals in messages', () => {
    const bad = [
      '{ not json',
      json({ version: 9, projects: [] }),
      json(makeBlob([makeProject({ status: 'nope' as never })])),
    ];
    for (const raw of bad) {
      try {
        parseImportJson(raw);
        assert.fail(`expected rejection for: ${raw.slice(0, 20)}`);
      } catch (err) {
        assert.ok(err instanceof Error);
        assert.doesNotMatch(err.message, /\n\s+at /);
        assert.doesNotMatch(err.message, /export\.ts|node_modules/);
        assert.ok(err.message.length <= 200);
      }
    }
  });
});

describe('parseImportJson — settings guards', () => {
  it('rejects an out-of-range idleDays', () => {
    assert.throws(
      () =>
        parseImportJson(
          json({ version: 1, projects: [], settings: { idleDays: 0 } }),
        ),
      /idleDays/i,
    );
    assert.throws(
      () =>
        parseImportJson(
          json({ version: 1, projects: [], settings: { idleDays: 4000 } }),
        ),
      /idleDays/i,
    );
  });

  it('rejects an invalid lastExportAt timestamp', () => {
    assert.throws(
      () =>
        parseImportJson(
          json({ version: 1, projects: [], settings: { lastExportAt: 'soon' } }),
        ),
      /lastExportAt/i,
    );
  });

  it('falls back to defaults for absent settings', () => {
    const parsed = parseImportJson(json({ version: 1, projects: [] }));
    assert.deepEqual(parsed.settings, { ...DEFAULT_SETTINGS });
  });

  it('rejects an unsafe theme value', () => {
    assert.throws(
      () =>
        parseImportJson(
          json({ version: 1, projects: [], settings: { theme: 'neon' } }),
        ),
      /theme/i,
    );
  });
});

describe('parseImportJson — prototype pollution', () => {
  it('does not pollute Object.prototype via __proto__ keys', () => {
    const raw = '{"version":1,"projects":[],"__proto__":{"polluted":true}}';
    const parsed = parseImportJson(raw);
    assert.equal(
      (Object.prototype as Record<string, unknown>).polluted,
      undefined,
    );
    assert.equal(
      (parsed as unknown as Record<string, unknown>).polluted,
      undefined,
    );
  });
});

describe('summarizeImport', () => {
  it('counts new and overlapping ids without side effects', () => {
    const current = makeBlob([makeProject({ id: 'a' })]);
    const incoming = makeBlob([
      makeProject({ id: 'a', title: 'Alpha 2' }),
      makeProject({ id: 'b', title: 'Beta' }),
    ]);
    const summary = summarizeImport(current, incoming);
    assert.equal(summary.currentCount, 1);
    assert.equal(summary.importCount, 2);
    assert.equal(summary.newIds, 1);
    assert.equal(summary.overlappingIds, 1);
    assert.deepEqual(summary.sampleTitles, ['Alpha 2', 'Beta']);
  });
});

describe('focus export compatibility', () => {
  it('round-trips optional focus state, including stoppedAt', () => {
    const focus: FocusState = {
      active: {
        id: 'active-1',
        projectId: 'p1',
        startedAt: '2026-08-03T09:00:00.000Z',
        endsAt: '2026-08-03T09:25:00.000Z',
        stoppedAt: '2026-08-03T09:01:00.000Z',
        plannedMinutes: 25,
      },
      history: [
        {
          id: 'record-1',
          projectId: 'p1',
          startedAt: '2026-08-03T08:00:00.000Z',
          endedAt: '2026-08-03T08:01:00.000Z',
          plannedMinutes: 25,
          elapsedSeconds: 60,
          outcome: 'stopped',
        },
      ],
    };
    const parsed = parseImportJson(toExportJson({ ...makeBlob(), focus }));
    assert.deepEqual(parsed.focus, focus);
  });

  it('keeps exports without focus backward compatible', () => {
    const parsed = parseImportJson(toExportJson(makeBlob()));
    assert.deepEqual(parsed.focus, { active: null, history: [] });
  });
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const source = readFileSync(new URL('./ProjectContext.tsx', import.meta.url), 'utf8');

describe('blocker mutation store wiring', () => {
  it('resolves the live project and commits only accepted note changes', () => {
    assert.match(source, /updateBlocker: \(id: string, text: string \| null\) => BlockerMutationResult;/);
    assert.match(source, /getProject,\n\s+updateBlocker,\n\s+updateNextAction,\n\s+addMilestone,\n\s+createProject,/);

    const actionStart = source.indexOf('const updateBlocker = useCallback(');
    assert.notEqual(actionStart, -1, 'store action exists');
    const actionEnd = source.indexOf('\n  const ', actionStart + 1);
    const action = source.slice(actionStart, actionEnd);

    assert.match(action, /if \(!ready\)/);
    assert.match(action, /projectsRef\.current\.find\(\(project\) => project\.id === id\)/);
    assert.match(action, /if \(!current\) return \{ kind: 'missing' \};/);
    assert.match(action, /updateBlockerNote\(current, text\)/);
    assert.match(action, /if \(result\.kind !== 'changed'\) return result;/);
    assert.match(action, /\.\.\.current,\s*notes_md: result\.notes,\s*updated_at: nowIso\(\),/);
    assert.match(action, /commitProjectSnapshot\(/);
    assert.match(action, /makeActivity\(\s*'project_updated'/);
    assert.equal((action.match(/pushActivity\(/g) ?? []).length, 1);
    assert.doesNotMatch(action, /updateProject\(/);
    assert.doesNotMatch(action, /status\s*:|saveRemoteWorkspace|queueRemoteWorkspaceSave/);
  });
});

describe('hydration snapshot application', () => {
  it('validates observed owner, cache, and journal before applying remote data', () => {
    const validation = source.indexOf('if (!isHydratedWorkspaceCurrent(hydrated))');
    const apply = source.indexOf('applySnapshot(snapshot)', validation);
    assert.notEqual(validation, -1);
    assert.ok(apply > validation);
    assert.match(source.slice(validation, apply), /remoteSyncRef\.current = 'failed'/);
    assert.match(source.slice(validation, apply), /setReady\(true\)/);
  });
});

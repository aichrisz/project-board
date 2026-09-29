import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const source = readFileSync(new URL('./ProjectContext.tsx', import.meta.url), 'utf8');

describe('blocker mutation store wiring', () => {
  it('resolves the live project and commits only accepted note changes', () => {
    assert.match(source, /updateBlocker: \(id: string, text: string \| null\) => BlockerMutationResult;/);
    assert.match(source, /getProject,\n\s+updateBlocker,\n\s+createProject,/);

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

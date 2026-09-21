import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';
import { describe, it } from 'node:test';
import { SEED_PROJECTS } from './seed';
import { PROJECT_STATUSES, PROJECT_TYPES } from '../types';

const APPROVED_PROJECT_IDS = [
  'project-board',
  'kairo-streak-guard',
  'kei-observatory',
  'proxy-ops-dashboard',
  'queue-quest',
  'blank-zero',
  'ink-engine',
  'glasshouse',
  'origami-war',
  'crown-fall',
  'shift-cockpit',
  'sprach-boss',
  'hotel-scenario-lab',
  'portfolio-hub',
  'lobby-ledger',
  'hotel-lobby-chaos-simulator',
  'fridge-friendo',
  'abel-immanuela-kristianto-portfolio',
  'nordhafen',
  'ai-development-command-center',
  'no-game-no-life-landing',
  'pixel-palooza',
  'my-api-profile',
  'catalog-console',
  'aceztea',
  'captcha-hell',
  'website-that-slowly-dies',
  'one-button-universe',
  'inkwell-framework',
  'workout-compass',
  'yeva-birthday-card',
] as const;

const EXCLUDED_PROJECT_IDS = [
  'kairo-vault',
  'kairo-backup',
  'roxy-vault',
  'roxy-backup',
  'blank-backup',
  'blank-second-brain',
  'nox-agent-backup',
  'nox-second-brain',
  'ai-development-command-center-demo',
  'blank-state',
  'front-office-rpg-simulator',
  'project-portfolio-dashboard',
  'orbit-tap',
  'lobby-chaos',
  'xvelocity-race',
  'roxy-landing',
  'portfolio-spa',
  'second-brain-ops',
  'hotelfach-learning',
] as const;

function isValidLink(url: string): boolean {
  if (isAbsolute(url)) return true;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

describe('curated current project inventory', () => {
  it('matches the approved membership and project-shape contract', () => {
    const ids = SEED_PROJECTS.map(({ id }) => id);
    const slugs = SEED_PROJECTS.map(({ slug }) => slug);
    const idSet = new Set(ids);

    assert.deepEqual(
      [...ids].sort(),
      [...APPROVED_PROJECT_IDS].sort(),
      'project IDs must match the approved inventory exactly',
    );
    assert.deepEqual(
      EXCLUDED_PROJECT_IDS.filter((id) => idSet.has(id)),
      [],
      'found excluded backup, vault, artifact, demo, or duplicate IDs',
    );
    assert.equal(new Set(ids).size, ids.length, 'project IDs must be unique');
    assert.equal(new Set(slugs).size, slugs.length, 'project slugs must be unique');

    for (const project of SEED_PROJECTS) {
      assert.ok(
        PROJECT_TYPES.includes(project.type),
        `invalid project type for ${project.id}: ${project.type}`,
      );
      assert.ok(
        PROJECT_STATUSES.includes(project.status),
        `invalid project status for ${project.id}: ${project.status}`,
      );
      for (const link of project.links) {
        assert.ok(isValidLink(link.url), `invalid link for ${project.id}: ${link.url}`);
      }
    }
  });

  it('keeps in-progress projects below complete progress', () => {
    for (const project of SEED_PROJECTS.filter(({ status }) => status === 'in_progress')) {
      assert.ok(
        project.steps.some(({ done }) => !done),
        `${project.id} must have an unfinished step`,
      );
      assert.ok(project.progress_pct < 100, `${project.id} must not report 100% progress`);
    }
  });

  it('keeps repository dates distinct from shared placeholder metadata', () => {
    assert.ok(
      new Set(SEED_PROJECTS.map(({ created_at }) => created_at)).size > 1,
      'projects must use their repository creation dates, not one shared placeholder',
    );
    assert.ok(
      new Set(SEED_PROJECTS.map(({ updated_at }) => updated_at)).size > 1,
      'projects must use their repository update dates, not one shared placeholder',
    );
  });

  it('uses the factual type for glasshouse', () => {
    assert.equal(SEED_PROJECTS.find(({ id }) => id === 'glasshouse')?.type, 'tool');
  });

  it('uses the factual stack for proxy-ops-dashboard', () => {
    const proxyOpsDashboard = SEED_PROJECTS.find(({ id }) => id === 'proxy-ops-dashboard');
    assert.ok(proxyOpsDashboard?.stack.includes('python'));
    assert.ok(!proxyOpsDashboard?.stack.includes('react'));
    assert.ok(!proxyOpsDashboard?.stack.includes('typescript'));
  });

  it('uses the factual stack for ink-engine', () => {
    const inkEngine = SEED_PROJECTS.find(({ id }) => id === 'ink-engine');
    assert.ok(inkEngine?.stack.includes('javascript'));
    assert.ok(!inkEngine?.stack.includes('typescript'));
  });

  it('uses the factual status for lobby-ledger', () => {
    assert.equal(SEED_PROJECTS.find(({ id }) => id === 'lobby-ledger')?.status, 'in_progress');
  });
});

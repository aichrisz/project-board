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
});

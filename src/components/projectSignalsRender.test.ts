import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { createServer, type ViteDevServer } from 'vite';
import type { ActivityEvent, Project } from '../types';

const initialTimezone = process.env.TZ;

const REVIEW_CONTEXT_MOCK_ID = '\u0000project-board-review-context-mock';
const DASHBOARD_CONTEXT_MOCK_ID = '\u0000project-board-dashboard-context-mock';
const ACTIVITY_CONTEXT_MOCK_ID = '\u0000project-board-activity-context-mock';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    title: 'Alpha',
    slug: 'alpha',
    type: 'tool',
    status: 'in_progress',
    summary: '',
    progress_pct: 0,
    steps: [{ id: 's1', title: 'Next task', done: false, order: 0 }],
    notes_md: '',
    links: [],
    tags: [],
    deadline: null,
    stack: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    started_at: null,
    starred: false,
    ...overrides,
  };
}

const reviewProjects = Array.from({ length: 4 }, (_, index) =>
  makeProject({ id: `p${index}`, title: `Project ${index}` }),
);

const reviewContextSource = `
  const projects = ${JSON.stringify(reviewProjects)};
  const activity = [{
    id: 'a1',
    at: '2026-09-20T00:00:00.000Z',
    type: 'status_changed',
    message: '“Project 0” → done',
  }];
  export function useProjects() {
    return {
      projects,
      activity,
      settings: { showCompleted: false, idleDays: 14, theme: 'system', lastExportAt: null },
      focus: { history: [] },
      softArchiveIdle: () => 0,
      exportData: () => {},
      ready: true,
    };
  }
`;

const dashboardContextSource = `
  export function useProjects() {
    return {
      projects: [],
      settings: { showCompleted: false, idleDays: 14, theme: 'system', lastExportAt: null },
      focus: { active: null },
      setShowCompleted: () => {},
      updateProject: () => {},
      addStep: () => {},
      duplicateProject: () => undefined,
      exportData: () => {},
      loadSeed: () => {},
      ready: true,
    };
  }
`;

const activityContextSource = `
  export function useProjects() {
    return {
      activity: [{
        id: 'a1',
        at: '2026-01-03T00:00:00.000Z',
        type: 'project_updated',
        message: 'updated',
      }],
      ready: true,
    };
  }
`;

let viteServer: ViteDevServer | undefined;

before(async () => {
  viteServer = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    plugins: [
      {
        name: 'project-board-review-context-mock',
        enforce: 'pre',
        resolveId(source, importer) {
          if (
            source === '../store/ProjectContext' &&
            importer?.endsWith('/src/pages/Review.tsx')
          ) {
            return REVIEW_CONTEXT_MOCK_ID;
          }
          if (
            source === '../store/ProjectContext' &&
            (importer?.endsWith('/src/pages/Dashboard.tsx') ||
              importer?.endsWith('/src/components/Onboarding.tsx') ||
              importer?.endsWith('/src/components/FocusSessionDrawer.tsx'))
          ) {
            return DASHBOARD_CONTEXT_MOCK_ID;
          }
          if (
            source === '../store/ProjectContext' &&
            importer?.endsWith('/src/pages/Activity.tsx')
          ) {
            return ACTIVITY_CONTEXT_MOCK_ID;
          }
          return undefined;
        },
        load(id) {
          if (id === REVIEW_CONTEXT_MOCK_ID) return reviewContextSource;
          if (id === DASHBOARD_CONTEXT_MOCK_ID) return dashboardContextSource;
          if (id === ACTIVITY_CONTEXT_MOCK_ID) return activityContextSource;
          return undefined;
        },
      },
    ],
  });
});

after(async () => {
  await viteServer?.close();
});

describe('project signal component rendering', () => {
  it('renders ProjectCard next action and freshness signals', async () => {
    const module = await viteServer!.ssrLoadModule('/src/components/ProjectCard.tsx');
    const ProjectCard = module.ProjectCard as ComponentType<{
      project: Project;
      idleDays: number;
      onToggleStar: (id: string) => void;
      onAddStep: (projectId: string, title: string) => void;
      onArchive: (id: string) => void;
    }>;
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(ProjectCard, {
          project: makeProject(),
          idleDays: 14,
          onToggleStar: () => {},
          onAddStep: () => {},
          onArchive: () => {},
        }),
      ),
    );

    assert.match(markup, /class="card-next-action"/);
    assert.match(markup, /Next action/);
    assert.match(markup, /class="card-next-action-value">Next task<\/span>/);
    assert.match(markup, /class="card-freshness">Review<\/span>/);
  });

  it('renders Review active-project advisory content', async () => {
    const module = await viteServer!.ssrLoadModule('/src/pages/Review.tsx');
    const Review = module.Review as ComponentType;
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(Review)),
    );

    assert.match(markup, /class="panel active-project-advisory"/);
    assert.match(markup, /data-tone="supportive"/);
    assert.match(
      markup,
      /4 projects in progress\. Consider continuing, pausing, or finishing one project\./,
    );
  });

  it('mounts exactly one weekly digest before the KPI row', async () => {
    const module = await viteServer!.ssrLoadModule('/src/pages/Review.tsx');
    const Review = module.Review as ComponentType;
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(Review)),
    );

    assert.equal(markup.match(/id="weekly-digest-title"/g)?.length, 1);
    assert.match(markup, /Weekly digest/);
    assert.ok(
      markup.indexOf('id="weekly-digest-title"') <
        markup.indexOf('review-kpi-row'),
    );
  });
});

describe('activity rendering', () => {
  it('renders project_updated as Updated', async () => {
    const module = await viteServer!.ssrLoadModule('/src/pages/Activity.tsx');
    const Activity = module.Activity as ComponentType;
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(Activity)),
    );

    assert.ok(markup.includes('class="activity-type activity-type-project_updated">Updated</span>'));
  });
});

describe('dashboard onboarding rendering', () => {
  it('keeps onboarding and exposes the empty-workspace Focus section', async () => {
    const module = await viteServer!.ssrLoadModule('/src/pages/Dashboard.tsx');
    const Dashboard = module.Dashboard as ComponentType;
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(Dashboard),
      ),
    );

    assert.match(markup, /class="onboarding"/);
    assert.match(markup, /Your Project Board is ready/);
    assert.equal(markup.match(/id="focus-projects-title"/g)?.length, 1);
    assert.match(markup, /<h2[^>]*>Focus<\/h2>/);
    assert.match(markup, /href="\/board"/);
  });
});

describe('focus project rendering', () => {
  it('renders three focus project links, signals, and review overflow', async () => {
    const module = await viteServer!.ssrLoadModule('/src/components/FocusProjects.tsx');
    const FocusProjects = module.FocusProjects as ComponentType<{ projects: Project[] }>;
    const staleUpdatedAt = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const projects = reviewProjects.map((project, index) => ({
      ...project,
      steps: index === 1 ? [] : project.steps,
      notes_md: index === 0 ? 'Blocker: Waiting on API' : '',
      updated_at: staleUpdatedAt,
    }));
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(FocusProjects, { projects }),
      ),
    );

    assert.match(markup, /<h2[^>]*>Focus<\/h2>/);
    assert.equal(markup.match(/href="\/project\/[^"]+"/g)?.length, 3);
    assert.match(markup, /Next action/);
    assert.match(markup, /Next task/);
    assert.match(
      markup,
      /<div class="focus-project-signal"><span class="focus-project-signal-label">Blocker<\/span><span class="focus-project-signal-value">Waiting on API<\/span><\/div>/,
    );
    assert.match(markup, /No next action recorded/);
    assert.match(markup, /No blocker recorded/);
    assert.match(
      markup,
      /<div class="focus-project-signal"><span class="focus-project-signal-label">Freshness<\/span><span class="focus-project-signal-value">Review<\/span><\/div>/,
    );
    assert.match(markup, /1 more active project/);
    assert.match(markup, /href="\/review"/);
  });

  it('renders a board link when there are no active projects', async () => {
    const module = await viteServer!.ssrLoadModule('/src/components/FocusProjects.tsx');
    const FocusProjects = module.FocusProjects as ComponentType<{ projects: Project[] }>;
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(FocusProjects, { projects: [makeProject({ status: 'paused' })] }),
      ),
    );

    assert.match(markup, /No active projects to focus on/);
    assert.match(markup, /href="\/board"/);
  });
});

describe('mobile project card targets', () => {
  it('keeps both project navigation links at the 44px touch target', () => {
    const css = readFileSync(
      fileURLToPath(new URL('../index.css', import.meta.url)),
      'utf8',
    );
    const mainLink = css.match(/\.card-head \.card-main-link\s*\{([^}]*)\}/)?.[1] ?? '';
    const progressLink = css.match(/\.card-progress-link\s*\{([^}]*)\}/)?.[1] ?? '';

    assert.match(css, /--touch:\s*44px;/);
    assert.match(mainLink, /display:\s*flex;/);
    assert.match(mainLink, /align-items:\s*center;/);
    assert.match(mainLink, /min-height:\s*var\(--touch\);/);
    assert.match(progressLink, /display:\s*flex;/);
    assert.match(progressLink, /align-items:\s*center;/);
    assert.match(progressLink, /min-height:\s*var\(--touch\);/);
  });

  it('keeps focus cards responsive and links touch-sized', () => {
    const css = readFileSync(
      fileURLToPath(new URL('../index.css', import.meta.url)),
      'utf8',
    );
    const focusGrid = css.match(/\.focus-project-grid\s*\{([^}]*)\}/)?.[1] ?? '';
    const focusCard = css.match(/\.focus-project-card\s*\{([^}]*)\}/)?.[1] ?? '';
    const focusLink = css.match(/\.focus-project-link\s*\{([^}]*)\}/)?.[1] ?? '';

    assert.match(focusGrid, /grid-template-columns:\s*1fr;/);
    assert.match(focusGrid, /min-width:\s*0;/);
    assert.match(focusCard, /min-width:\s*0;/);
    assert.match(focusLink, /min-height:\s*var\(--touch\);/);
    assert.match(
      css,
      /@media\s*\(min-width:\s*900px\)[\s\S]*?\.focus-project-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    );
    assert.doesNotMatch(focusCard, /(?:^|\n)\s*width\s*:/);
    assert.doesNotMatch(focusLink, /(?:^|\n)\s*width\s*:/);
  });
});

describe('weekly digest rendering', () => {
  const stale = new Date(Date.now() - 90 * 86_400_000).toISOString();

  function milestoneNotes(count: number): string {
    return Array.from(
      { length: count },
      (_, index) =>
        `Milestone 2026-09-${String(index + 1).padStart(2, '0')}: Win ${String(index + 1).padStart(2, '0')}`,
    ).join('\n');
  }

  it('renders the four headings, caps each section, and shows signals and links', async () => {
    const module = await viteServer!.ssrLoadModule('/src/components/WeeklyDigest.tsx');
    const WeeklyDigest = module.WeeklyDigest as ComponentType<{
      projects: Project[];
      activity: ActivityEvent[];
    }>;
    const projects = [
      makeProject({
        id: 'p0',
        title: 'Alpha',
        updated_at: stale,
        notes_md: 'Blocker: Waiting on API',
        steps: [],
      }),
      makeProject({ id: 'p1', title: 'Beta', updated_at: stale }),
      makeProject({ id: 'p2', title: 'Gamma', updated_at: stale }),
      makeProject({ id: 'p3', title: 'Delta', updated_at: stale }),
      makeProject({
        id: 'p4',
        title: 'Epsilon',
        status: 'paused',
        updated_at: stale,
        notes_md: 'Blocker: Frozen',
      }),
      makeProject({
        id: 'p5',
        title: 'Zeta',
        status: 'idea',
        updated_at: stale,
        notes_md: milestoneNotes(6),
      }),
    ];
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(WeeklyDigest, { projects, activity: [] }),
      ),
    );

    assert.match(markup, /<h2[^>]*>Weekly digest<\/h2>/);
    assert.match(markup, /<h3[^>]*>Keep moving<\/h3>/);
    assert.match(markup, /<h3[^>]*>Needs attention<\/h3>/);
    assert.match(markup, /<h3[^>]*>Latest wins<\/h3>/);

    assert.equal(markup.match(/class="weekly-digest-link"/g)?.length, 3);
    assert.equal(
      markup.match(/class="weekly-digest-link weekly-digest-attention-link"/g)?.length,
      5,
    );
    assert.equal(
      markup.match(/class="weekly-digest-link weekly-digest-win-link"/g)?.length,
      5,
    );

    assert.match(markup, /Next action/);
    assert.match(markup, /No next action recorded/);
    assert.match(markup, /Blocker/);
    assert.match(markup, /Waiting on API/);
    assert.match(markup, /No blocker recorded/);
    assert.match(markup, /Freshness/);
    assert.match(markup, />Review<\/span>/);
    assert.match(markup, /href="\/project\/p0"/);
    assert.ok(markup.indexOf('Win 06') < markup.indexOf('Win 05'));
  });

  it('renders the three empty states', async () => {
    const module = await viteServer!.ssrLoadModule('/src/components/WeeklyDigest.tsx');
    const WeeklyDigest = module.WeeklyDigest as ComponentType<{
      projects: Project[];
      activity: ActivityEvent[];
    }>;
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(WeeklyDigest, { projects: [], activity: [] }),
      ),
    );

    assert.match(markup, /No projects in progress/);
    assert.match(markup, /href="\/board"/);
    assert.match(markup, /Nothing needs attention\./);
    assert.match(markup, /No wins recorded yet\./);
  });

  function winAnchors(markup: string) {
    return [...markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
      .filter((match) => match[1].includes('weekly-digest-win-link'))
      .map((match) => {
        const time = /<time\b([^>]*)>([^<]*)<\/time>/.exec(match[2]);
        return {
          attrs: match[1],
          body: match[2],
          datetime: time ? /dateTime="([^"]*)"/.exec(time[1])?.[1] : undefined,
          label: time?.[2],
        };
      });
  }

  it('links live win projects to detail but falls back to activity when the project is gone', async () => {
    const module = await viteServer!.ssrLoadModule('/src/components/WeeklyDigest.tsx');
    const WeeklyDigest = module.WeeklyDigest as ComponentType<{
      projects: Project[];
      activity: ActivityEvent[];
    }>;
    const projects = [makeProject({ id: 'p0', title: 'Alpha' })];
    const activity: ActivityEvent[] = [
      {
        id: 'ghost',
        at: '2026-09-21T12:00:00.000Z',
        type: 'status_changed',
        projectId: 'ghost',
        message: '“Ghost” → done',
      },
      {
        id: 'live',
        at: '2026-09-20T12:00:00.000Z',
        type: 'status_changed',
        projectId: 'p0',
        message: '“Alpha” → done',
      },
    ];
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(WeeklyDigest, { projects, activity }),
      ),
    );

    const anchors = winAnchors(markup);
    const ghost = anchors.find((anchor) => anchor.body.includes('Ghost'));
    const live = anchors.find((anchor) => anchor.body.includes('Alpha'));

    assert.ok(ghost && live, 'expected both activity wins to render');
    assert.match(ghost!.attrs, /href="\/activity"/);
    assert.doesNotMatch(ghost!.attrs, /href="\/project\/ghost"/);
    assert.match(live!.attrs, /href="\/project\/p0"/);
  });

  describe('activity dates in the local calendar', () => {
    const previousTimezone = process.env.TZ;

    before(() => {
      process.env.TZ = 'America/Los_Angeles';
    });

    after(() => {
      if (previousTimezone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = previousTimezone;
      }
    });

    it('renders a canonical activity year below one hundred with four digits', async () => {
      const module = await viteServer!.ssrLoadModule('/src/components/WeeklyDigest.tsx');
      const WeeklyDigest = module.WeeklyDigest as ComponentType<{
        projects: Project[];
        activity: ActivityEvent[];
      }>;
      const activity: ActivityEvent[] = [
        {
          id: 'ancient',
          at: '0099-06-15T02:30:00.000Z',
          type: 'status_changed',
          projectId: 'p0',
          message: '“Alpha” → done',
        },
      ];
      const markup = renderToStaticMarkup(
        createElement(
          MemoryRouter,
          null,
          createElement(WeeklyDigest, { projects: [], activity }),
        ),
      );

      const ancient = winAnchors(markup).find((anchor) =>
        anchor.body.includes('→ done'),
      );

      assert.ok(ancient, 'expected the ancient activity win to render');
      assert.equal(ancient!.label, '0099-06-14');
      assert.equal(ancient!.datetime, '0099-06-15T02:30:00.000Z');
    });

    it('keeps stored milestone dates while rendering activity in the local calendar', async () => {
      assert.equal(
        new Date('2026-09-20T02:30:00.000Z').getDate(),
        19,
        'this regression requires the America/Los_Angeles timezone',
      );
      const module = await viteServer!.ssrLoadModule('/src/components/WeeklyDigest.tsx');
      const WeeklyDigest = module.WeeklyDigest as ComponentType<{
        projects: Project[];
        activity: ActivityEvent[];
      }>;
      const projects = [
        makeProject({
          id: 'p0',
          title: 'Alpha',
          notes_md: 'Milestone 2026-09-20: Shipped stored date',
        }),
      ];
      const activity: ActivityEvent[] = [
        {
          id: 'late-night',
          at: '2026-09-20T02:30:00.000Z',
          type: 'status_changed',
          projectId: 'p0',
          message: '“Alpha” → done',
        },
      ];
      const markup = renderToStaticMarkup(
        createElement(
          MemoryRouter,
          null,
          createElement(WeeklyDigest, { projects, activity }),
        ),
      );

      const anchors = winAnchors(markup);
      const activityWin = anchors.find((anchor) => anchor.body.includes('→ done'));
      const milestoneWin = anchors.find((anchor) =>
        anchor.body.includes('Shipped stored date'),
      );

      assert.ok(activityWin && milestoneWin, 'expected both wins to render');
      assert.equal(activityWin!.label, '2026-09-19');
      assert.equal(activityWin!.datetime, '2026-09-20T02:30:00.000Z');
      assert.equal(milestoneWin!.label, '2026-09-20');
    });
  });
});

describe('timezone isolation', () => {
  it('restores the process timezone after local-calendar digest tests', () => {
    assert.equal(process.env.TZ, initialTimezone);
  });
});

describe('weekly digest responsive css', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../index.css', import.meta.url)),
    'utf8',
  );

  it('defaults to one column and switches to two columns at desktop', () => {
    const grid = css.match(/\.weekly-digest-grid\s*\{([^}]*)\}/)?.[1] ?? '';

    assert.match(grid, /grid-template-columns:\s*1fr;/);
    assert.match(grid, /min-width:\s*0;/);
    assert.match(
      css,
      /@media\s*\(min-width:\s*1024px\)[\s\S]*?\.weekly-digest-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    );
  });

  it('keeps linked names focus-visible and touch-sized', () => {
    const link = css.match(/\.weekly-digest-link\s*\{([^}]*)\}/)?.[1] ?? '';
    const focus = css.match(/\.weekly-digest-link:focus-visible\s*\{([^}]*)\}/)?.[1] ?? '';

    assert.match(link, /min-height:\s*var\(--touch\);/);
    assert.match(focus, /outline:\s*2px solid var\(--pb-focus-ring\);/);
  });
});

describe('review action overflow css', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../index.css', import.meta.url)),
    'utf8',
  );

  it('lets narrow review actions wrap without removing global button nowrap', () => {
    const reviewButton = css.match(/\.review-actions\s+\.btn\s*\{([^}]*)\}/)?.[1] ?? '';
    const baseButton = css.match(/(?:^|\n)\.btn\s*\{([^}]*)\}/)?.[1] ?? '';

    assert.match(reviewButton, /white-space:\s*normal;/);
    assert.match(reviewButton, /max-width:\s*100%;/);
    assert.match(baseButton, /white-space:\s*nowrap;/);
  });
});

import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { createServer, type ViteDevServer } from 'vite';
import type { Project } from '../types';

const REVIEW_CONTEXT_MOCK_ID = '\u0000project-board-review-context-mock';

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
  export function useProjects() {
    return {
      projects,
      settings: { showCompleted: false, idleDays: 14, theme: 'system', lastExportAt: null },
      focus: { history: [] },
      softArchiveIdle: () => 0,
      exportData: () => {},
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
          return undefined;
        },
        load(id) {
          return id === REVIEW_CONTEXT_MOCK_ID ? reviewContextSource : undefined;
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
});

describe('focus project rendering', () => {
  it('renders three focus project links, signals, and review overflow', async () => {
    const module = await viteServer!.ssrLoadModule('/src/components/FocusProjects.tsx');
    const FocusProjects = module.FocusProjects as ComponentType<{ projects: Project[] }>;
    const projects = reviewProjects.map((project, index) => ({
      ...project,
      steps: index === 1 ? [] : project.steps,
      notes_md: index === 0 ? 'Blocker: Waiting on API' : '',
      updated_at: '2026-01-01T00:00:00.000Z',
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

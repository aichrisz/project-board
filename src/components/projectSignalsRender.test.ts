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
});

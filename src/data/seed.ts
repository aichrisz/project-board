import type { Project } from '../types';
import { withAutoProgress } from '../lib/progress';

const now = '2026-07-14T12:00:00.000Z';

/**
 * Realistic inventory template for projects on this host.
 * Seed is not auto-loaded; load via onboarding or Settings.
 */
const raw: Project[] = [
  {
    id: 'project-board',
    title: 'Project Board',
    slug: 'project-board',
    type: 'web',
    status: 'in_progress',
    summary:
      'Local-first personal project inventory (this app). Vite + React + TypeScript; v0.7 discipline.',
    progress_pct: 0,
    steps: [
      { id: 'pb-1', title: 'PRD + implementation plan', done: true, order: 1 },
      { id: 'pb-2', title: 'MVP dashboard + detail', done: true, order: 2 },
      { id: 'pb-3', title: 'v0.2–v0.3 board, activity, export/seed', done: true, order: 3 },
      { id: 'pb-4', title: 'v0.4 polish (theme, markdown, shortcuts)', done: true, order: 4 },
      { id: 'pb-5', title: 'v0.4.1 mobile layout', done: true, order: 5 },
      { id: 'pb-6', title: 'v0.5 Focus (stars, due soon, soft archive)', done: true, order: 6 },
      { id: 'pb-7', title: 'v0.6 Real inventory seed + version chrome', done: true, order: 7 },
      { id: 'pb-8', title: 'v0.7 Discipline (reorder, focus, backup, duplicate, links)', done: true, order: 8 },
      { id: 'pb-9', title: 'Next polish / optional deploy', done: false, order: 9 },
    ],
    notes_md: `This app — **Project Board** v0.7.

Local path: \`/root/projects/abel-project-dashboard\`

- Storage key: \`project-board-v1\`
- English UI only; brand name stays **Project Board**
- Soft deadline for wrapping the discipline pass`,
    links: [
      {
        id: 'pb-link-path',
        label: 'Local path',
        url: '/root/projects/abel-project-dashboard',
      },
    ],
    tags: ['dashboard', 'local-first', 'vite'],
    deadline: '2026-07-20',
    stack: ['react', 'typescript', 'vite'],
    created_at: '2026-07-10T10:00:00.000Z',
    updated_at: now,
    started_at: '2026-07-11T08:00:00.000Z',
    starred: true,
  },
  {
    id: 'orbit-tap',
    title: 'Orbit Tap',
    slug: 'orbit-tap',
    type: 'game',
    status: 'done',
    summary:
      'One-button orbital survival. Playable v1.4 with juice, near-miss, Endless / Sprint / Daily modes.',
    progress_pct: 0,
    steps: [
      { id: 'ot-1', title: 'Core orbit + tap loop', done: true, order: 1 },
      { id: 'ot-2', title: 'Juice + near-miss feedback', done: true, order: 2 },
      { id: 'ot-3', title: 'Modes: Endless / Sprint / Daily', done: true, order: 3 },
      { id: 'ot-4', title: 'v1.4 playable ship', done: true, order: 4 },
    ],
    notes_md: `Playable **v1.4**.

Local path: \`/root/projects/orbit-tap\`

- Dev server often on port **8770**
- Canvas one-button arcade; tunnel URLs are ephemeral`,
    links: [
      {
        id: 'ot-link-path',
        label: 'Local path',
        url: '/root/projects/orbit-tap',
      },
    ],
    tags: ['canvas', 'one-button', 'arcade'],
    deadline: null,
    stack: ['html', 'canvas', 'javascript'],
    created_at: '2026-05-10T10:00:00.000Z',
    updated_at: '2026-07-01T18:00:00.000Z',
    starred: false,
  },
  {
    id: 'lobby-chaos',
    title: 'Lobby Chaos',
    slug: 'lobby-chaos',
    type: 'game',
    status: 'done',
    summary:
      'Hotelfach lobby mini-game (DE + ID). v0.5 with Zimmerplan; verify suite 61/61 green.',
    progress_pct: 0,
    steps: [
      { id: 'lc-1', title: 'Core lobby loop + UI', done: true, order: 1 },
      { id: 'lc-2', title: 'DE + ID copy', done: true, order: 2 },
      { id: 'lc-3', title: 'Zimmerplan feature', done: true, order: 3 },
      { id: 'lc-4', title: 'v0.5 ship + verify 61/61', done: true, order: 4 },
    ],
    notes_md: `Playable **v0.5** — Hotelfach practice game.

Local path: \`/root/projects/lobby-chaos\`

- Languages: German + Indonesian
- Zimmerplan included
- Verify harness: **61/61** passing`,
    links: [],
    tags: ['hotelfach', 'canvas', 'bilingual'],
    deadline: null,
    stack: ['html', 'canvas', 'javascript'],
    created_at: '2026-05-01T10:00:00.000Z',
    updated_at: '2026-06-28T16:00:00.000Z',
    starred: false,
  },
  {
    id: 'xvelocity-race',
    title: 'xVELOCITY Race',
    slug: 'xvelocity-race',
    type: 'game',
    status: 'done',
    summary: '2D easy-race arcade game — playable core loop shipped.',
    progress_pct: 0,
    steps: [
      { id: 'xv-1', title: 'Physics + controls', done: true, order: 1 },
      { id: 'xv-2', title: 'Track / race loop', done: true, order: 2 },
      { id: 'xv-3', title: 'Playable build', done: true, order: 3 },
    ],
    notes_md: `Playable 2D race.

Local path: \`/root/projects/xvelocity-race\`

Easy-difficulty race loop; further polish optional.`,
    links: [],
    tags: ['race', 'arcade', '2d'],
    deadline: null,
    stack: ['html', 'canvas', 'javascript'],
    created_at: '2026-04-01T10:00:00.000Z',
    updated_at: '2026-06-20T12:00:00.000Z',
    starred: false,
  },
  {
    id: 'roxy-landing',
    title: 'Roxy Landing',
    slug: 'roxy-landing',
    type: 'web',
    status: 'paused',
    summary:
      'Fan character landing page for Roxy. Local only — no GitHub Pages until the owner asks.',
    progress_pct: 0,
    steps: [
      { id: 'rl-1', title: 'Layout + hero', done: true, order: 1 },
      { id: 'rl-2', title: 'Media / embeds', done: true, order: 2 },
      { id: 'rl-3', title: 'Copy + mobile QA', done: false, order: 3 },
      { id: 'rl-4', title: 'Public deploy (only if requested)', done: false, order: 4 },
    ],
    notes_md: `Fan landing — **paused**.

Local path: \`/root/projects/roxy-landing\`

- Dev often on port **8765**
- **Do not** publish to GitHub Pages until the owner explicitly asks`,
    links: [],
    tags: ['landing', 'character', 'fan'],
    deadline: null,
    stack: ['html', 'css', 'javascript'],
    created_at: '2026-06-01T10:00:00.000Z',
    updated_at: '2026-07-05T09:00:00.000Z',
    starred: false,
  },
  {
    id: 'portfolio-spa',
    title: 'Portfolio SPA',
    slug: 'portfolio-spa',
    type: 'web',
    status: 'planned',
    summary:
      'Personal portfolio in TypeScript. Live links already exist; SPA refresh is planned work.',
    progress_pct: 0,
    steps: [
      { id: 'ps-1', title: 'Audit current GH Pages portfolio', done: false, order: 1 },
      { id: 'ps-2', title: 'TypeScript SPA structure', done: false, order: 2 },
      { id: 'ps-3', title: 'Case studies for shipped games', done: false, order: 3 },
      { id: 'ps-4', title: 'Deploy / cutover', done: false, order: 4 },
    ],
    notes_md: `Planned portfolio refresh (TypeScript SPA).

Existing public sites (keep linked until cutover):

- GitHub Pages portfolio
- Personal domain`,
    links: [
      {
        id: 'ps-link-gh',
        label: 'GitHub Pages portfolio',
        url: 'https://aichrisz.github.io/abel-immanuela-kristianto-portfolio/',
      },
      {
        id: 'ps-link-domain',
        label: 'aichrisz.com',
        url: 'https://aichrisz.com',
      },
    ],
    tags: ['portfolio', 'typescript'],
    deadline: null,
    stack: ['typescript', 'react'],
    created_at: '2026-07-01T10:00:00.000Z',
    updated_at: now,
    starred: false,
  },
  {
    id: 'second-brain-ops',
    title: 'Second Brain + Hermes ops',
    slug: 'second-brain-ops',
    type: 'infra',
    status: 'in_progress',
    summary:
      'Obsidian vault + Hermes agent ops: daily crons, capture hygiene, GitHub vault backup.',
    progress_pct: 0,
    steps: [
      { id: 'sb-1', title: 'Vault path + structure stable', done: true, order: 1 },
      { id: 'sb-2', title: 'Morning cron 05:30 UTC', done: true, order: 2 },
      { id: 'sb-3', title: 'Nightly cron 20:00 UTC', done: true, order: 3 },
      { id: 'sb-4', title: 'GitHub roxy-vault backup wiring', done: true, order: 4 },
      { id: 'sb-5', title: 'Ongoing hygiene / skill pack updates', done: false, order: 5 },
    ],
    notes_md: `Vault + agent ops (in progress).

Vault path: \`/root/Obsidian/Abel-Second-Brain\`

Crons (UTC):

- Morning **05:30**
- Nightly **20:00**

GitHub backup: **roxy-vault** private mirror.

Keep notes operational — not a second product UI.`,
    links: [
      {
        id: 'sb-link-vault',
        label: 'Vault path',
        url: '/root/Obsidian/Abel-Second-Brain',
      },
    ],
    tags: ['ops', 'vault', 'hermes', 'cron'],
    deadline: null,
    stack: ['bash', 'markdown', 'obsidian'],
    created_at: '2026-05-20T10:00:00.000Z',
    updated_at: now,
    starred: true,
  },
  {
    id: 'hotelfach-learning',
    title: 'Hotelfach study aids',
    slug: 'hotelfach-learning',
    type: 'learning',
    status: 'in_progress',
    summary:
      'Vocab and study tools around Azubi Hotelfach. Lobby Chaos doubles as practice game.',
    progress_pct: 0,
    steps: [
      { id: 'hl-1', title: 'Core vocab lists (DE)', done: true, order: 1 },
      { id: 'hl-2', title: 'Practice via Lobby Chaos', done: true, order: 2 },
      { id: 'hl-3', title: 'Expand tools / flashcards', done: false, order: 3 },
      { id: 'hl-4', title: 'Exam-period review plan', done: false, order: 4 },
    ],
    notes_md: `Azubi **Hotelfach** learning track.

- Vocab / study aids (in progress)
- Related game: **Lobby Chaos** at \`/root/projects/lobby-chaos\` (playable practice)
- No single code repo required; may live across notes + small tools`,
    links: [],
    tags: ['hotelfach', 'azubi', 'vocab'],
    deadline: null,
    stack: ['markdown', 'html'],
    created_at: '2026-03-15T10:00:00.000Z',
    updated_at: '2026-07-10T11:00:00.000Z',
    starred: false,
  },
];

export const SEED_PROJECTS: Project[] = raw.map((p) => withAutoProgress(p));

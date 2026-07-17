import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { openWeeklySnapshot } from '../lib/snapshot';
import { useProjects } from '../store/ProjectContext';
import { APP_VERSION } from '../version';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { ThemeToggle } from './ThemeToggle';

const PRIMARY_NAV = [
  { to: '/', end: true, label: 'Dashboard', short: 'Home' },
  { to: '/board', end: false, label: 'Board', short: 'Board' },
  { to: '/review', end: false, label: 'Review', short: 'Review' },
  { to: '/activity', end: false, label: 'Activity', short: 'Log' },
  { to: '/settings', end: false, label: 'Settings', short: 'More' },
] as const;

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'nav-link active' : 'nav-link';
}

function tabClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'bottom-tab active' : 'bottom-tab';
}

export function Layout() {
  const { exportData, projects } = useProjects();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Escape + focus when sheet opens
  useEffect(() => {
    if (!menuOpen) return;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden>
              ▣
            </span>
            <span className="brand-text">Project Board</span>
          </Link>
          <nav className="nav nav-desktop" aria-label="Main">
            {PRIMARY_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={navClass}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="topbar-actions">
          <div className="topbar-actions-desktop">
            <ThemeToggle />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => openWeeklySnapshot(projects)}
              title="Weekly snapshot"
            >
              Snapshot
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={exportData}
            >
              Export
            </button>
          </div>
          <Link to="/new" className="btn btn-primary btn-new-project">
            <span className="btn-new-full">+ New project</span>
            <span className="btn-new-short" aria-hidden>
              + New
            </span>
          </Link>
          <button
            ref={menuBtnRef}
            type="button"
            className="btn btn-ghost menu-toggle"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="menu-toggle-icon" aria-hidden>
              {menuOpen ? '✕' : '☰'}
            </span>
          </button>
        </div>
      </header>

      {menuOpen && (
        <div
          className="menu-backdrop"
          onClick={() => setMenuOpen(false)}
          aria-hidden
        />
      )}
      <div
        id={menuId}
        className={`menu-sheet${menuOpen ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        hidden={!menuOpen}
      >
        <div className="menu-sheet-header">
          <span className="menu-sheet-title">Actions</span>
          <button
            ref={closeBtnRef}
            type="button"
            className="btn btn-ghost btn-menu-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>
        <div className="menu-sheet-actions">
          <ThemeToggle />
          <button
            type="button"
            className="btn btn-secondary menu-sheet-btn"
            onClick={() => {
              openWeeklySnapshot(projects);
              setMenuOpen(false);
            }}
          >
            Snapshot
          </button>
          <button
            type="button"
            className="btn btn-secondary menu-sheet-btn"
            onClick={() => {
              exportData();
              setMenuOpen(false);
            }}
          >
            Export
          </button>
          <Link
            to="/new"
            className="btn btn-primary menu-sheet-btn"
            onClick={() => setMenuOpen(false)}
          >
            + New project
          </Link>
        </div>
      </div>

      <main className="main">
        <Outlet />
      </main>

      <footer className="app-footer">
        <span className="app-footer-brand">Project Board</span>
        <span className="app-footer-version" aria-label={`Version ${APP_VERSION}`}>
          v{APP_VERSION}
        </span>
      </footer>

      <nav className="bottom-nav" aria-label="Primary">
        {PRIMARY_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={tabClass}
          >
            <span className="bottom-tab-label">{item.short}</span>
          </NavLink>
        ))}
      </nav>

      <KeyboardShortcuts />
    </div>
  );
}

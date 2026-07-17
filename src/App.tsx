import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Activity } from './pages/Activity';
import { Board } from './pages/Board';
import { Dashboard } from './pages/Dashboard';
import { NewProject } from './pages/NewProject';
import { ProjectDetail } from './pages/ProjectDetail';
import { Review } from './pages/Review';
import { Settings } from './pages/Settings';
import { ProjectProvider } from './store/ProjectContext';

/** Vite base ends with `/`; React Router basename should not. */
function routerBasename(): string | undefined {
  const raw = import.meta.env.BASE_URL || '/';
  const trimmed = raw.replace(/\/$/, '');
  return trimmed === '' || trimmed === '/' ? undefined : trimmed;
}

export default function App() {
  return (
    <ProjectProvider>
      <BrowserRouter basename={routerBasename()}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="board" element={<Board />} />
            <Route path="review" element={<Review />} />
            <Route path="activity" element={<Activity />} />
            <Route path="project/:id" element={<ProjectDetail />} />
            <Route path="new" element={<NewProject />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ProjectProvider>
  );
}

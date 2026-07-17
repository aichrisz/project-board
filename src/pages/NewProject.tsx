import { useNavigate } from 'react-router-dom';
import { ProjectForm } from '../components/ProjectForm';
import { useProjects } from '../store/ProjectContext';

export function NewProject() {
  const navigate = useNavigate();
  const { createProject } = useProjects();

  return (
    <div className="detail-page">
      <div className="page-header">
        <h1 className="page-title">New project</h1>
        <p className="page-subtitle">Add a project in under 30 seconds.</p>
      </div>
      <ProjectForm
        submitLabel="Create project"
        onCancel={() => navigate('/')}
        onSubmit={(input) => {
          const p = createProject(input);
          navigate(`/project/${p.id}`);
        }}
      />
    </div>
  );
}

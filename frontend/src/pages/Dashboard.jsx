import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import {
  getProjects,
  deleteProject,
  getAssessments,
  deleteAssessment,
  startTransformation,
} from '../api/client';
import { nameFor, LANGUAGES } from '../languages';
import Flag from '../components/ui/Flag';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';
import PageLayout from '../components/layout/PageLayout';

const STATUS_STYLES = {
  created: 'bg-surface text-text-muted',
  processing: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
};

export default function Dashboard() {
  const { currentUser } = useUser();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [startingProjectId, setStartingProjectId] = useState(null);
  const [deletingAssessmentId, setDeletingAssessmentId] = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    Promise.all([
      getProjects(currentUser.id),
      getAssessments(currentUser.id).catch(() => []),
    ])
      .then(([projs, assmnts]) => {
        setProjects(projs);
        setAssessments(assmnts);
      })
      .catch((err) => {
        console.error('Failed to load data:', err);
        setError('Failed to load data.');
      })
      .finally(() => setLoading(false));
  }, [currentUser]);

  async function handleDelete(id) {
    if (!window.confirm('Delete this project? This cannot be undone.')) return;
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  }

  async function handleStart(project) {
    const isRestart = project.status === 'completed' || project.status === 'failed';
    if (
      isRestart &&
      !window.confirm('Restart transformation? Existing generated chapters will be replaced.')
    ) {
      return;
    }

    setStartingProjectId(project.id);
    setError(null);
    try {
      const { job_id } = await startTransformation(project.id);
      navigate(`/project/${project.id}/processing`, {
        state: { jobId: job_id },
      });
    } catch (err) {
      console.error('Failed to start transformation:', err);
      setError(err.message || 'Failed to start transformation.');
    } finally {
      setStartingProjectId(null);
    }
  }

  async function handleDeleteAssessment(sessionId) {
    if (!window.confirm('Delete this assessment session?')) return;
    setDeletingAssessmentId(sessionId);
    try {
      await deleteAssessment(sessionId);
      setAssessments((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      console.error('Failed to delete assessment:', err);
    } finally {
      setDeletingAssessmentId(null);
    }
  }

  if (!currentUser) {
    return (
      <PageLayout>
        <p className="text-text-muted">Select a user to view projects.</p>
      </PageLayout>
    );
  }

  // Build level summary from user.levels
  const levels = currentUser.levels || {};
  const levelEntries = Object.entries(levels);
  const searchQuery = projectSearch.trim().toLowerCase();

  const filteredProjects = searchQuery
    ? projects.filter((project) => {
      const haystack = [
        project.title,
        project.source_text,
        project.status,
        project.target_language,
        nameFor(project.target_language),
        project.source_language,
        LANGUAGES[project.source_language]?.name || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(searchQuery);
    })
    : projects;

  return (
    <PageLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Projects</h1>
          <p className="text-sm text-text-muted mt-1">
            {currentUser.name}
            {levelEntries.length > 0 && (
              <span>
                {' '}&middot;{' '}
                {levelEntries.map(([code, lv]) => (
                  <span key={code} className="mr-2">
                    <Flag code={code} size="sm" /> Lv {lv}
                  </span>
                ))}
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => navigate('/project/new')}>New project</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <p className="text-red-600">{error}</p>
        </div>
      ) : (
        <>
          {/* Projects list */}
          <div className="mb-4">
            <input
              type="text"
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              placeholder="Search projects (title, text, language, status)"
              className="w-full max-w-md px-3 py-2 border border-border rounded-lg text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </div>

          {projects.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-text-muted mb-4">No projects yet.</p>
              <Button onClick={() => navigate('/project/new')}>
                Create your first project
              </Button>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-text-muted">No projects match your search.</p>
            </div>
          ) : (
            <div className="space-y-3 mb-12">
              {filteredProjects.map((project) => (
                <Card key={project.id} className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      {project.status === 'completed' || project.status === 'processing' ? (
                        <Link
                          to={
                            project.status === 'completed'
                              ? `/project/${project.id}/read`
                              : `/project/${project.id}/processing`
                          }
                          className="text-base font-medium hover:text-accent no-underline text-text"
                        >
                          <Flag code={project.target_language} size="sm" /> {project.title}
                        </Link>
                      ) : (
                        <div className="text-base font-medium text-text">
                          <Flag code={project.target_language} size="sm" /> {project.title}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[project.status] || STATUS_STYLES.created}`}
                        >
                          {project.status}
                        </span>
                        <span className="text-xs text-text-muted">
                          {nameFor(project.target_language)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {project.status === 'processing' ? (
                        <button
                          onClick={() => navigate(`/project/${project.id}/processing`)}
                          className="text-sm text-text-muted hover:text-text px-2 py-1"
                        >
                          Open
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStart(project)}
                          disabled={startingProjectId === project.id}
                          className="text-sm text-accent hover:text-accent-hover disabled:opacity-50 px-2 py-1"
                        >
                          {startingProjectId === project.id
                            ? 'Starting...'
                            : (project.status === 'created' ? 'Start' : 'Restart')}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(project.id)}
                        className="text-text-muted hover:text-red-600 text-sm px-2 py-1"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Assessment history */}
          {assessments.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-serif text-xl font-semibold">Assessment history</h2>
                <Button variant="secondary" onClick={() => navigate('/assessment')}>
                  New assessment
                </Button>
              </div>
              <div className="space-y-2">
                {assessments.map((s) => (
                  <div
                    key={s.id}
                    className="w-full px-4 py-3 rounded-lg bg-surface hover:bg-border/50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <button
                        onClick={() => navigate(`/assessment?session=${s.id}`)}
                        className="flex-1 text-left"
                      >
                        <span className="text-sm">
                          <Flag code={s.target_language} size="sm" /> {nameFor(s.target_language)}{' '}
                          <span className="text-text-muted">
                            &middot; {new Date(s.created_at).toLocaleDateString()}
                          </span>
                        </span>
                        <div className="text-xs mt-0.5">
                          {s.completed ? (
                            <span className="text-emerald-600">Level {s.result_level}</span>
                          ) : (
                            <span className="text-text-muted">In progress</span>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => handleDeleteAssessment(s.id)}
                        disabled={deletingAssessmentId === s.id}
                        className="text-xs text-text-muted hover:text-red-600 disabled:opacity-50"
                      >
                        {deletingAssessmentId === s.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </PageLayout>
  );
}

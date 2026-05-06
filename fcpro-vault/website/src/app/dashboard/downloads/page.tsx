'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getApiError,
  licenseApi,
  projectApi,
  type License,
  type Project,
} from '../../../lib/api';
import { useAuth } from '../../../lib/auth';

const tierRank: Record<string, number> = {
  standard: 1,
  professional: 2,
  enterprise: 3,
};

function formatBytes(value: string | null) {
  if (value === null) return 'Unknown size';
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return 'Unknown size';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DownloadsPage() {
  useAuth({ requireAuth: true });
  const [license, setLicense] = useState<License | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProject, setActiveProject] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([licenseApi.getMy(), projectApi.list()])
      .then(([licenseData, projectData]) => {
        setLicense(licenseData);
        setProjects(projectData);
      })
      .catch((error) => toast.error(getApiError(error)))
      .finally(() => setLoading(false));
  }, []);

  const openProject = async (projectId: string) => {
    setActiveProject(projectId);
    try {
      const token = await projectApi.getDownloadUrl(projectId);
      window.location.href = `fcpvault://open?projectId=${encodeURIComponent(
        projectId,
      )}&token=${encodeURIComponent(token.token)}&checksum=${encodeURIComponent(
        token.checksum,
      )}`;
      toast.success('Opening FCPro Vault desktop client');
    } catch (error) {
      toast.error(getApiError(error));
    } finally {
      setActiveProject(null);
    }
  };

  const currentTier = license?.tier ?? 'standard';

  return (
    <section className="fade-up">
      <p className="eyebrow">Project downloads</p>
      <h1 className="page-title">Encrypted FCP library.</h1>
      {loading ? (
        <div className="spinner" />
      ) : (
        <div className="grid-3">
          {projects.map((project) => {
            const requiredTier = project.requiredTier.toLowerCase();
            const accessible =
              (tierRank[currentTier] ?? 1) >= (tierRank[requiredTier] ?? 1);

            return (
              <article className="card project-card" key={project.id}>
                <div className="project-thumb">🎬</div>
                <h2>{project.title}</h2>
                <p>{formatBytes(project.fileSizeBytes)}</p>
                <span className="badge badge-amber">
                  {project.requiredTier}
                </span>
                {accessible ? (
                  <button
                    className="btn btn-amber"
                    disabled={activeProject === project.id}
                    onClick={() => void openProject(project.id)}
                  >
                    {activeProject === project.id ? 'Preparing...' : '▶ Open in FCP'}
                  </button>
                ) : (
                  <button className="btn btn-outline" disabled>
                    🔒 Requires {project.requiredTier}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

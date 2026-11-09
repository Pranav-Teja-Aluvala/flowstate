import { ProjectNavigation } from '@/components/project-navigation';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import { db, projects, repositories } from '@flowstate/database';
import { canManage, canWrite } from '@flowstate/contracts';
import { requireUser } from '@/lib/auth';
import { userWorkspaces } from '@/lib/queries';
import { saveProject, deleteProject } from '@/lib/actions';
import { disconnectRepository } from '@/lib/github-actions';
import { Shell } from '@/components/shell';
import { ActionForm, Dialog } from '@/components/forms';

export default async function ProjectSettings({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const user = await requireUser();
  const spaces = await userWorkspaces(user.id);
  const workspace = spaces.find((w) => w.id === workspaceId);
  if (!workspace) notFound();
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) notFound();
  const repo = canManage(workspace.role)
    ? await db.query.repositories.findFirst({ where: eq(repositories.projectId, projectId) })
    : null;
  return (
    <Shell user={user} workspaces={spaces} active={workspaceId}>
      <header className="topbar">
        <span>
          {project.name}
          <span className="crumb">/</span>
          <strong>Project settings</strong>
        </span>
      </header>
      <main className="workspace-main settings-main">
        <Link className="back-link" href={`/w/${workspaceId}/p/${projectId}`}>
          <ArrowLeft size={15} />
          Back to project
        </Link>
        <section className="page-heading">
          <div>
            <p className="eyebrow">PROJECT SETTINGS</p>
            <h1>Project details</h1>
            <p className="muted">Manage the details behind your team’s work.</p>
          </div>
        </section>
        <ProjectNavigation workspaceId={workspaceId} projectId={projectId} active="settings" />
        <section className="settings-card">
          <h2>General</h2>
          {canWrite(workspace.role) ? (
            <ActionForm action={saveProject}>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="projectId" value={projectId} />
              <label>
                Project name
                <input name="name" defaultValue={project.name} required maxLength={80} />
              </label>
              <label>
                Description
                <textarea name="description" defaultValue={project.description} maxLength={1000} />
              </label>
            </ActionForm>
          ) : (
            <p className="muted">You have view-only access to this project.</p>
          )}
        </section>
        {canManage(workspace.role) && (
          <section className="danger-zone" aria-labelledby="danger-title">
            <div>
              <h2 id="danger-title">
                <TriangleAlert size={18} />
                Danger zone
              </h2>
              <p>
                Deleting a project permanently removes its boards, tasks, documents, and saved
                document content. This cannot be undone.
              </p>
            </div>
            <Dialog title="Permanently delete project" trigger="Delete project" destructive>
              <p className="deletion-warning">
                You are deleting <strong>{project.name}</strong> and all its contents. Type the
                project name to confirm.
              </p>
              <ActionForm action={deleteProject} label="Permanently delete project" destructive>
                <input type="hidden" name="workspaceId" value={workspaceId} />
                <input type="hidden" name="projectId" value={projectId} />
                <label>
                  Project name confirmation
                  <input name="confirmation" required autoComplete="off" />
                </label>
              </ActionForm>
            </Dialog>
          </section>
        )}
        {repo && (
          <section className="danger-zone">
            <div>
              <h2>Disconnect GitHub repository</h2>
              <p>
                {repo.owner}/{repo.name} is connected. Disconnecting removes this project’s local
                code sessions and saved buffers. GitHub branches and pull requests remain on GitHub.
              </p>
            </div>
            <Dialog title="Disconnect repository" trigger="Disconnect repository" destructive>
              <ActionForm action={disconnectRepository} label="Confirm disconnection" destructive>
                <input type="hidden" name="projectId" value={projectId} />
                <label>
                  Type {repo.owner}/{repo.name} to confirm
                  <input name="confirmation" required autoComplete="off" />
                </label>
              </ActionForm>
            </Dialog>
          </section>
        )}
      </main>
    </Shell>
  );
}

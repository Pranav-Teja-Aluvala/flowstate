import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, projects, projectFiles, projectFileVersions } from '@flowstate/database';
import { canWrite } from '@flowstate/contracts';
import { requireUser } from '@/lib/auth';
import { userWorkspaces } from '@/lib/queries';
import { Shell } from '@/components/shell';
import { FileUpload } from '@/components/file-upload';
import { NewDocument } from '@/components/new-document';
export default async function ProjectFiles({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const user = await requireUser();
  const spaces = await userWorkspaces(user.id);
  const workspace = spaces.find((space) => space.id === workspaceId);
  if (!workspace) notFound();
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) notFound();
  const files = await db
    .select({
      id: projectFiles.id,
      name: projectFiles.name,
      size: projectFiles.size,
      createdAt: projectFiles.createdAt,
    })
    .from(projectFiles)
    .where(eq(projectFiles.projectId, projectId))
    .orderBy(desc(projectFiles.createdAt));
  const [historyUsage] = await db
    .select({ bytes: sql<number>`coalesce(sum(${projectFileVersions.size}),0)::int` })
    .from(projectFileVersions)
    .innerJoin(projectFiles, eq(projectFileVersions.fileId, projectFiles.id))
    .where(eq(projectFiles.projectId, projectId));
  return (
    <Shell user={user} workspaces={spaces} active={workspaceId}>
      <header className="topbar">
        <span>
          {workspace.name}
          <span className="crumb">/</span>
          <strong>{project.name}</strong>
        </span>
        <span className="pill">Files</span>
      </header>
      <main className="workspace-main settings-main">
        <Link className="back-link" href={`/w/${workspaceId}/p/${projectId}`}>
          ← Project overview
        </Link>
        <section className="page-heading">
          <div>
            <p className="eyebrow">KEEP THE CONTEXT TOGETHER</p>
            <h1>
              Project files<span className="heading-dot">.</span>
            </h1>
            <p className="muted">
              Keep your team’s documents in one place. Download shared files in their original
              format.
            </p>
          </div>
          {canWrite(workspace.role) && <NewDocument projectId={projectId} />}
        </section>
        {canWrite(workspace.role) && <FileUpload projectId={projectId} />}
        <section className="settings-card">
          <h2>
            Shared files <span className="pill">{files.length}</span>
          </h2>
          {files.length ? (
            <ul className="project-file-list">
              {files.map((file) => (
                <li key={file.id}>
                  <a className="back-link" href={`/api/v1/files/${file.id}`}>
                    {file.name}
                  </a>
                  <span className="muted"> · {Math.ceil(file.size / 1024)} KiB</span>
                  {/\.(pdf|docx|xlsx|pptx)$/i.test(file.name) && (
                    <Link
                      className="button secondary"
                      href={`/w/${workspaceId}/p/${projectId}/files/${file.id}`}
                    >
                      Open editor
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No files yet. Editors can upload the first file.</p>
          )}
          <p className="muted">
            {(
              (files.reduce((sum, file) => sum + file.size, 0) + historyUsage.bytes) /
              (1024 * 1024)
            ).toFixed(1)}{' '}
            / 100 MiB used in this project, including file history.
          </p>
        </section>
      </main>
    </Shell>
  );
}

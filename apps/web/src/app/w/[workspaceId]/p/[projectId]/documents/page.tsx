import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db, projects, documents, documentStates } from '@flowstate/database';
import { canWrite } from '@flowstate/contracts';
import { requireUser } from '@/lib/auth';
import { userWorkspaces } from '@/lib/queries';
import { Shell } from '@/components/shell';
import { ProjectNavigation } from '@/components/project-navigation';
import { NewDocument } from '@/components/new-document';
import { DocumentLibrary } from '@/components/document-library';
export default async function ProjectDocuments({
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
  const items = await db
    .select({
      id: documents.id,
      title: documents.title,
      kind: documents.kind,
      updatedAt: documents.updatedAt,
      savedAt: documentStates.savedAt,
    })
    .from(documents)
    .leftJoin(documentStates, eq(documentStates.documentId, documents.id))
    .where(eq(documents.projectId, projectId))
    .orderBy(desc(documents.updatedAt));
  const base = `/w/${workspaceId}/p/${projectId}`;
  return (
    <Shell user={user} workspaces={spaces} active={workspaceId}>
      <header className="topbar">
        <span>
          {project.name}
          <span className="crumb">/</span>
          <strong>Documents</strong>
        </span>
        <span className="pill">Shared library</span>
      </header>
      <main className="workspace-main settings-main">
        <Link className="back-link" href={`/w/${workspaceId}`}>
          ← All projects
        </Link>
        <section className="page-heading">
          <div>
            <p className="eyebrow">{project.name}</p>
            <h1>Documents</h1>
            <p className="muted">
              Create together, pick up where you left off, and export the finished work.
            </p>
          </div>
          {canWrite(workspace.role) && <NewDocument projectId={projectId} />}
        </section>
        <ProjectNavigation workspaceId={workspaceId} projectId={projectId} active="documents" />
        <DocumentLibrary
          documents={items.map((d) => ({
            ...d,
            updatedAt: new Date(
              Math.max(d.updatedAt.getTime(), d.savedAt?.getTime() || 0),
            ).toISOString(),
          }))}
          base={base}
        />
        <aside className="library-help">
          <strong>Have an existing file?</strong>
          <p>
            Keep uploaded Word, Excel, PowerPoint and PDF files in Files. Editing uploads in their
            original layout depends on your workspace’s Office connection.
          </p>
          <Link className="back-link" href={`${base}/files`}>
            Go to shared files →
          </Link>
        </aside>
      </main>
    </Shell>
  );
}

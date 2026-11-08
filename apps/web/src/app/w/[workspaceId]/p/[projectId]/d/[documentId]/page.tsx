import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileText } from 'lucide-react';
import { db, projects, documents } from '@flowstate/database';
import { canWrite } from '@flowstate/contracts';
import { requireUser } from '@/lib/auth';
import { userWorkspaces } from '@/lib/queries';
import { renameDocument } from '@/lib/work-actions';
import { ActionForm, Dialog } from '@/components/forms';
import { CollaborativeEditor } from '@/components/editor';
import { Shell } from '@/components/shell';
export default async function DocumentPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string; documentId: string }>;
}) {
  const { workspaceId, projectId, documentId } = await params;
  const user = await requireUser();
  const spaces = await userWorkspaces(user.id);
  const workspace = spaces.find((w) => w.id === workspaceId);
  if (!workspace) notFound();
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) notFound();
  const document = await db.query.documents.findFirst({
    where: and(eq(documents.id, documentId), eq(documents.projectId, projectId)),
  });
  if (!document) notFound();
  return (
    <Shell user={user} workspaces={spaces} active={workspaceId}>
      <header className="topbar">
        <span>
          {project.name}
          <span className="crumb">/</span>
          <strong>Document</strong>
        </span>
        <FileText size={16} />
      </header>
      <main className="workspace-main document-main">
        <Link className="back-link" href={`/w/${workspaceId}/p/${projectId}`}>
          <ArrowLeft size={14} />
          Back to {project.name}
        </Link>
        <section className="page-heading">
          <div>
            <p className="eyebrow">THINK ON THE SAME PAGE</p>
            <h1>{document.title}</h1>
          </div>
          {canWrite(workspace.role) && (
            <Dialog title="Rename document" trigger="Rename">
              <ActionForm action={renameDocument} label="Rename document">
                <input type="hidden" name="documentId" value={documentId} />
                <label>
                  Document title
                  <input name="title" defaultValue={document.title} required maxLength={80} />
                </label>
              </ActionForm>
            </Dialog>
          )}
        </section>
        <CollaborativeEditor
          documentId={documentId}
          user={user}
          editable={canWrite(workspace.role)}
        />
      </main>
    </Shell>
  );
}

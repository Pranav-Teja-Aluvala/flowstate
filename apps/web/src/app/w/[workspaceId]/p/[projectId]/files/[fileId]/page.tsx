import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db, projectFileVersions } from '@flowstate/database';
import { requireUser } from '@/lib/auth';
import { fileAccess } from '@/lib/file-access';
import { userWorkspaces } from '@/lib/queries';
import { Shell } from '@/components/shell';
import { OfficeEditor } from '@/components/office-editor';
import { canManage } from '@flowstate/contracts';
import { Dialog, ActionForm } from '@/components/forms';
import { restoreFileVersion } from '@/lib/file-history-actions';
import { FileExport } from '@/components/file-export';
export default async function FileStudio({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string; fileId: string }>;
}) {
  const { workspaceId, projectId, fileId } = await params;
  const user = await requireUser();
  const access = await fileAccess(fileId, user.id);
  if (!access || access.workspaceId !== workspaceId || access.file.projectId !== projectId)
    notFound();
  const spaces = await userWorkspaces(user.id);
  const versions = await db
    .select({
      id: projectFileVersions.id,
      version: projectFileVersions.version,
      createdAt: projectFileVersions.createdAt,
    })
    .from(projectFileVersions)
    .where(and(eq(projectFileVersions.fileId, fileId)))
    .orderBy(desc(projectFileVersions.version));
  return (
    <Shell user={user} workspaces={spaces} active={workspaceId}>
      <header className="topbar">
        <Link href={`/w/${workspaceId}/p/${projectId}/files`}>← Project files</Link>
        <span className="pill">Version {access.file.version}</span>
      </header>
      <main className="workspace-main office-main">
        <section className="page-heading">
          <div>
            <p className="eyebrow">SHARED FILE STUDIO</p>
            <h1>{access.file.name}</h1>
          </div>
          <div className="document-actions">
            <a className="button secondary" href={`/api/v1/files/${fileId}`}>
              Download latest saved file
            </a>
            <FileExport fileId={fileId} name={access.file.name} />
          </div>
        </section>
        {process.env.OFFICE_JWT_SECRET && process.env.OFFICE_PUBLIC_URL ? (
          <OfficeEditor key={access.file.version} fileId={fileId} />
        ) : (
          <section className="settings-card integration-unavailable">
            <h2>Keep working with this file.</h2>
            <p className="muted">
              You can download the original file and its saved versions here. Editing an uploaded
              Office/PDF file while keeping its original layout needs a connected Office editor,
              which is not configured on this instance.
            </p>
            <p className="muted">
              To start a new Word document, spreadsheet, presentation, or PDF without additional
              setup, use New document in your project.
            </p>
            <Link className="button primary" href={`/w/${workspaceId}/p/${projectId}`}>
              Create a document in FLOWSTATE →
            </Link>
          </section>
        )}
        <p className="muted small">
          Exports use the latest saved version. Close every office editor and wait for save-back
          before exporting.
        </p>
        {versions.length > 0 && (
          <section className="settings-card">
            <h2>Previous versions</h2>
            <ul className="project-file-list">
              {versions.map((version) => (
                <li key={version.id}>
                  <a href={`/api/v1/files/${fileId}?version=${version.id}`}>
                    Download version {version.version}
                  </a>
                  {canManage(access.role) && (
                    <Dialog
                      title={`Restore version ${version.version}`}
                      trigger={`Restore version ${version.version}`}
                    >
                      <p className="deletion-warning">
                        Close all editors first. Restoring ends the current editing session and
                        keeps its latest saved file in history. Unsaved editor changes cannot be
                        recovered. Type {access.file.name} to continue.
                      </p>
                      <ActionForm action={restoreFileVersion} label="Restore version">
                        <input type="hidden" name="fileId" value={fileId} />
                        <input type="hidden" name="versionId" value={version.id} />
                        <input type="hidden" name="expectedVersion" value={access.file.version} />
                        <label>
                          File name confirmation
                          <input name="confirm" required />
                        </label>
                      </ActionForm>
                    </Dialog>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </Shell>
  );
}

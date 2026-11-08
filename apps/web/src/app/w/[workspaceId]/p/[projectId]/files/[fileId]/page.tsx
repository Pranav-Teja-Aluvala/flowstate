import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db, projectFileVersions } from '@flowstate/database';
import { requireUser } from '@/lib/auth';
import { fileAccess } from '@/lib/file-access';
import { userWorkspaces } from '@/lib/queries';
import { Shell } from '@/components/shell';
import { OfficeEditor } from '@/components/office-editor';
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
          <a className="button secondary" href={`/api/v1/files/${fileId}`}>
            Download latest saved file
          </a>
        </section>
        <OfficeEditor fileId={fileId} />
        {versions.length > 0 && (
          <section className="settings-card">
            <h2>Previous versions</h2>
            <ul className="project-file-list">
              {versions.map((version) => (
                <li key={version.id}>
                  <a href={`/api/v1/files/${fileId}?version=${version.id}`}>
                    Download version {version.version}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </Shell>
  );
}

import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, projects, memberships, projectFiles, projectFileVersions } from '@flowstate/database';
import { canWrite } from '@flowstate/contracts';
import { currentUser } from '@/lib/auth';
import {
  FileProblem,
  fileMetadata,
  readUpload,
  validateFile,
  PROJECT_FILE_QUOTA,
} from '@/lib/file-policy';
import { storageProvider, putFile, discardUncommittedFile } from '@/lib/file-storage';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  if (
    request.headers.get('origin') !== new URL(process.env.APP_URL || 'http://localhost:3000').origin
  )
    return Response.json({ error: 'Origin denied.' }, { status: 403 });
  const user = await currentUser();
  if (!user) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  const projectId = (await context.params).projectId;
  if (!z.uuid().safeParse(projectId).success)
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  const [access] = await db
    .select({ workspaceId: projects.workspaceId, role: memberships.role })
    .from(projects)
    .innerJoin(
      memberships,
      and(eq(memberships.workspaceId, projects.workspaceId), eq(memberships.userId, user.id)),
    )
    .where(eq(projects.id, projectId));
  if (!access || !canWrite(access.role))
    return Response.json({ error: 'You do not have permission to upload files.' }, { status: 403 });
  try {
    let filename: string;
    try {
      filename = decodeURIComponent(request.headers.get('x-file-name') || '');
    } catch {
      throw new FileProblem('Invalid filename.');
    }
    fileMetadata(filename);
    const body = await readUpload(request);
    const metadata = validateFile(filename, body);
    const provider = storageProvider();
    const id = randomUUID();
    const key = `${projectId}/${id}`;
    await db.transaction(async (tx) => {
      // Serialize uploads and recheck membership after waiting for a concurrent upload.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`files:${projectId}`}))`);
      const [live] = await tx
        .select({ role: memberships.role })
        .from(projects)
        .innerJoin(
          memberships,
          and(eq(memberships.workspaceId, projects.workspaceId), eq(memberships.userId, user.id)),
        )
        .where(eq(projects.id, projectId));
      if (!live || !canWrite(live.role))
        throw new FileProblem('Upload permission was revoked.', 403);
      const [usage] = await tx
        .select({ bytes: sql<number>`coalesce(sum(${projectFiles.size}), 0)::int` })
        .from(projectFiles)
        .where(eq(projectFiles.projectId, projectId));
      const [history] = await tx
        .select({ bytes: sql<number>`coalesce(sum(${projectFileVersions.size}),0)::int` })
        .from(projectFileVersions)
        .innerJoin(projectFiles, eq(projectFileVersions.fileId, projectFiles.id))
        .where(eq(projectFiles.projectId, projectId));
      if (usage.bytes + history.bytes + body.length > PROJECT_FILE_QUOTA)
        throw new FileProblem('This project has reached its 100 MiB file limit.', 413);
      await putFile(provider, key, body, metadata.mimeType);
      try {
        await tx.insert(projectFiles).values({
          id,
          projectId,
          name: filename,
          mimeType: metadata.mimeType,
          size: body.length,
          storageKey: key,
          storageProvider: provider,
          createdBy: user.id,
        });
      } catch (error) {
        await discardUncommittedFile(provider, key).catch(() => {});
        throw error;
      }
    });
    return Response.json(
      { id, name: filename },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof FileProblem
            ? error.message
            : 'Unable to upload this file. Check the instance storage configuration.',
      },
      { status: error instanceof FileProblem ? error.status : 503 },
    );
  }
}

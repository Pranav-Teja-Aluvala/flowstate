import { randomUUID } from 'node:crypto';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  db,
  projectFiles,
  projectFileVersions,
  memberships,
  projects,
  sessions,
  activityEvents,
} from '@flowstate/database';
import { canWrite } from '@flowstate/contracts';
import { officeCallback, readOfficeJSON, downloadOfficeResult } from '@/lib/office-policy';
import { putFile, discardUncommittedFile, type StorageProvider } from '@/lib/file-storage';
import { validateFile, FileProblem, PROJECT_FILE_QUOTA } from '@/lib/file-policy';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await context.params;
    if (!z.uuid().safeParse(fileId).success) throw new FileProblem('File not found.', 404);
    const body = await readOfficeJSON(request);
    const token =
      request.headers.get('authorization')?.replace(/^Bearer /, '') ||
      (typeof body.token === 'string' ? body.token : '');
    // Read only the signed callback payload; do not trust unsigned body parameters.
    const callback = officeCallback(token);
    if (![1, 2, 4].includes(callback.status))
      throw new FileProblem(
        'Only final office saves are supported. Close every editor to save.',
        409,
      );
    await db.transaction(async (tx) => {
      const existing = await tx.query.projectFiles.findFirst({
        where: eq(projectFiles.id, fileId),
      });
      if (!existing) throw new FileProblem('File not found.', 404);
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`files:${existing.projectId}`}))`,
      );
      const file = await tx.query.projectFiles.findFirst({ where: eq(projectFiles.id, fileId) });
      if (!file) throw new FileProblem('File not found.', 404);
      if (file.officeKey !== callback.key) {
        if (callback.status === 2 && file.officeSavedKey === callback.key) return; // Idempotent final-save retry.
        throw new FileProblem('This office session has already ended.', 409);
      }
      if (callback.status !== 2) return;
      if (!callback.url || !callback.users?.length)
        throw new FileProblem('Office save information missing.');
      const project = await tx.query.projects.findFirst({ where: eq(projects.id, file.projectId) });
      if (!project) throw new FileProblem('Project not found.', 404);
      const editors = await tx
        .select({ role: memberships.role, userId: memberships.userId })
        .from(memberships)
        .innerJoin(
          sessions,
          and(eq(sessions.userId, memberships.userId), gt(sessions.expiresAt, new Date())),
        )
        .where(
          and(
            eq(memberships.workspaceId, project.workspaceId),
            inArray(memberships.userId, callback.users),
          ),
        );
      const editor = editors.find((person) => canWrite(person.role));
      if (!editor) throw new FileProblem('Office editing permission was revoked.', 403);
      const bytes = await downloadOfficeResult(callback.url);
      const metadata = validateFile(file.name, bytes);
      if (callback.filetype && callback.filetype.toLowerCase() !== metadata.extension)
        throw new FileProblem('Office server returned a different file format.', 409);
      const [usage] = await tx
        .select({ bytes: sql<number>`coalesce(sum(${projectFiles.size}),0)::int` })
        .from(projectFiles)
        .where(eq(projectFiles.projectId, file.projectId));
      const [history] = await tx
        .select({ bytes: sql<number>`coalesce(sum(${projectFileVersions.size}),0)::int` })
        .from(projectFileVersions)
        .innerJoin(projectFiles, eq(projectFileVersions.fileId, projectFiles.id))
        .where(eq(projectFiles.projectId, file.projectId));
      if (usage.bytes + history.bytes + bytes.length > PROJECT_FILE_QUOTA)
        throw new FileProblem('This project has reached its 100 MiB file/history limit.', 413);
      const storageKey = `${file.projectId}/${randomUUID()}`;
      const provider = z.enum(['local', 'supabase']).parse(file.storageProvider) as StorageProvider;
      await putFile(provider, storageKey, bytes, file.mimeType);
      try {
        await tx.insert(projectFileVersions).values({
          fileId,
          version: file.version,
          size: file.size,
          storageKey: file.storageKey,
          storageProvider: file.storageProvider,
        });
        await tx
          .update(projectFiles)
          .set({
            storageKey,
            size: bytes.length,
            version: file.version + 1,
            updatedAt: new Date(),
            officeKey: randomUUID(),
            officeSavedKey: callback.key,
          })
          .where(eq(projectFiles.id, fileId));
        await tx.insert(activityEvents).values({
          workspaceId: project.workspaceId,
          actorId: editor.userId,
          action: 'file.saved',
          objectType: 'file',
          objectId: fileId,
        });
      } catch (error) {
        await discardUncommittedFile(provider, storageKey).catch(() => {});
        throw error;
      }
    });
    return Response.json({ error: 0 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json(
      {
        error: 1,
        message:
          error instanceof FileProblem
            ? error.message
            : 'Office save denied. Your previous file is unchanged.',
      },
      { status: error instanceof FileProblem ? error.status : 400 },
    );
  }
}

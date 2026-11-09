'use server';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  db,
  projectFiles,
  projectFileVersions,
  projects,
  activityEvents,
} from '@flowstate/database';
import { requireMembership } from './auth';
import { getFile, putFile, discardUncommittedFile, type StorageProvider } from './file-storage';
import { PROJECT_FILE_QUOTA } from './file-policy';
import type { ActionState } from './actions';
export async function restoreFileVersion(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let uncommitted: { provider: StorageProvider; key: string } | null = null;
  try {
    const fileId = z.uuid().parse(form.get('fileId'));
    const versionId = z.uuid().parse(form.get('versionId'));
    const expectedVersion = z.coerce.number().int().positive().parse(form.get('expectedVersion'));
    const first = await db.query.projectFiles.findFirst({ where: eq(projectFiles.id, fileId) });
    if (!first) throw new Error('File not found.');
    const project = await db.query.projects.findFirst({ where: eq(projects.id, first.projectId) });
    if (!project) throw new Error('Project not found.');
    const { user } = await requireMembership(project.workspaceId, 'manage');
    if (String(form.get('confirm')) !== first.name)
      return { error: 'Type the exact file name to restore this version.' };
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`files:${first.projectId}`}))`);
      const current = await tx.query.projectFiles.findFirst({ where: eq(projectFiles.id, fileId) });
      if (!current || current.version !== expectedVersion)
        throw new Error('This file changed. Refresh before restoring.');
      const previous = await tx.query.projectFileVersions.findFirst({
        where: and(eq(projectFileVersions.id, versionId), eq(projectFileVersions.fileId, fileId)),
      });
      if (!previous) throw new Error('Previous version not found.');
      const [usage] = await tx
        .select({ bytes: sql<number>`coalesce(sum(${projectFiles.size}),0)::int` })
        .from(projectFiles)
        .where(eq(projectFiles.projectId, first.projectId));
      const [history] = await tx
        .select({ bytes: sql<number>`coalesce(sum(${projectFileVersions.size}),0)::int` })
        .from(projectFileVersions)
        .innerJoin(projectFiles, eq(projectFileVersions.fileId, projectFiles.id))
        .where(eq(projectFiles.projectId, first.projectId));
      if (usage.bytes + history.bytes + previous.size > PROJECT_FILE_QUOTA)
        throw new Error('The project file/history limit has been reached.');
      const bytes = await getFile(previous.storageProvider, previous.storageKey);
      if (bytes.length !== previous.size) throw new Error('Stored file unavailable.');
      const provider = z.enum(['local', 'supabase']).parse(current.storageProvider);
      const key = `${current.projectId}/${randomUUID()}`;
      await putFile(provider, key, bytes, current.mimeType);
      uncommitted = { provider, key };
      await tx.insert(projectFileVersions).values({
        fileId,
        version: current.version,
        size: current.size,
        storageKey: current.storageKey,
        storageProvider: current.storageProvider,
      });
      await tx
        .update(projectFiles)
        .set({
          version: current.version + 1,
          storageKey: key,
          size: bytes.length,
          officeKey: randomUUID(),
          officeSavedKey: null,
          updatedAt: new Date(),
        })
        .where(eq(projectFiles.id, fileId));
      await tx.insert(activityEvents).values({
        workspaceId: project.workspaceId,
        actorId: user.id,
        action: 'file.restored',
        objectType: 'file',
        objectId: fileId,
      });
    });
    uncommitted = null;
    revalidatePath('/');
    return {
      success:
        'Previous version restored as a new version. The replaced file is kept in history. Reopen the editor.',
    };
  } catch (error) {
    if (uncommitted)
      await discardUncommittedFile(
        (uncommitted as { provider: StorageProvider; key: string }).provider,
        (uncommitted as { provider: StorageProvider; key: string }).key,
      ).catch(() => {});
    return {
      error:
        error instanceof Error && /permission|changed|not found|limit/i.test(error.message)
          ? error.message
          : 'Unable to restore this file. Please try again.',
    };
  }
}

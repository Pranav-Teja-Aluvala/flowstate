'use server';
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as Y from 'yjs';
import {
  db,
  codeFiles,
  codeSessions,
  codeStates,
  codeSuggestions,
  codeComments,
  projects,
  activityEvents,
} from '@flowstate/database';
import { importRuntimeBuffers } from '@flowstate/github/runtime';
import { GitHubError, repositoryAccess } from '@flowstate/github';
import { requireMembership, tokenHash } from './auth';
import type { ActionState } from './actions';
import { normalizeCodeText } from '@flowstate/contracts';
const field = (form: FormData, name: string) => String(form.get(name) ?? '');
const id = (form: FormData, name: string) => z.uuid().parse(field(form, name));
const snapshotHash = (content: string) => createHash('sha256').update(content).digest('hex');
async function access(sessionId: string, permission: 'read' | 'write' | 'manage') {
  const session = await db.query.codeSessions.findFirst({ where: eq(codeSessions.id, sessionId) });
  if (!session) throw new Error('Code session not found.');
  const project = await db.query.projects.findFirst({ where: eq(projects.id, session.projectId) });
  if (!project) throw new Error('Project not found.');
  const member = await requireMembership(project.workspaceId, permission);
  await repositoryAccess(member.user.id, project.id, permission !== 'read');
  return { session, project, ...member };
}
export async function codeSnapshot(fileId: string) {
  z.uuid().parse(fileId);
  const file = await db.query.codeFiles.findFirst({ where: eq(codeFiles.id, fileId) });
  if (!file) throw new Error('Code file not found.');
  await access(file.sessionId, 'read');
  const state = await db.query.codeStates.findFirst({ where: eq(codeStates.fileId, fileId) });
  const document = new Y.Doc();
  try {
    if (state) Y.applyUpdate(document, state.yjsState);
    return {
      file,
      content: normalizeCodeText(state ? document.getText('code').toString() : file.initialContent),
    };
  } finally {
    document.destroy();
  }
}
function failure(error: unknown): ActionState {
  if (error instanceof z.ZodError) return { error: error.issues[0].message };
  if (
    error instanceof GitHubError ||
    (error instanceof Error && /permission|changed|not found|pending|limit/i.test(error.message))
  )
    return { error: error.message };
  return { error: 'Unable to save this review. Refresh and try again.' };
}
export async function addCodeComment(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const sessionId = id(form, 'sessionId');
    const { user, project } = await access(sessionId, 'write');
    const body = z.string().trim().min(1).max(2000).parse(field(form, 'body'));
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`review:${sessionId}`}))`);
      const [count] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(codeComments)
        .where(eq(codeComments.sessionId, sessionId));
      if (count.n >= 500)
        throw new Error('This session has reached its comment limit. Start a new code session.');
      await tx.insert(codeComments).values({ sessionId, authorId: user.id, body });
      await tx.insert(activityEvents).values({
        workspaceId: project.workspaceId,
        actorId: user.id,
        action: 'code.commented',
        objectType: 'code_session',
        objectId: sessionId,
      });
    });
    revalidatePath('/');
    return { success: 'Comment added.' };
  } catch (error) {
    return failure(error);
  }
}
export async function proposeCodeChange(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const fileId = id(form, 'fileId');
    const { file, content } = await codeSnapshot(fileId);
    const { user, project } = await access(file.sessionId, 'write');
    if ((await snapshotHash(content)) !== field(form, 'baselineHash'))
      throw new Error('Shared code changed. Refresh before proposing a change.');
    const title = z.string().trim().min(1).max(120).parse(field(form, 'title'));
    const proposedContent = z
      .string()
      .max(64 * 1024)
      .refine(
        (s) => Buffer.byteLength(s) <= 64 * 1024 && !s.includes('\0'),
        'Suggestions support UTF-8 files up to 64 KiB.',
      )
      .transform(normalizeCodeText)
      .parse(field(form, 'content'));
    if (Buffer.byteLength(content) > 64 * 1024)
      return { error: 'Suggestions support files up to 64 KiB.' };
    if (content === proposedContent)
      return { error: 'Change the suggested code before submitting.' };
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`review:${file.sessionId}`}))`);
      const [count] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(codeSuggestions)
        .where(eq(codeSuggestions.fileId, fileId));
      if (count.n >= 50)
        throw new Error('This file has reached its suggestion limit. Start a new code session.');
      await tx.insert(codeSuggestions).values({
        fileId,
        authorId: user.id,
        title,
        baselineHash: await snapshotHash(content),
        beforeContent: content,
        proposedContent,
      });
      await tx.insert(activityEvents).values({
        workspaceId: project.workspaceId,
        actorId: user.id,
        action: 'code.suggested',
        objectType: 'code_file',
        objectId: fileId,
      });
    });
    revalidatePath('/');
    return { success: 'Suggestion sent for review.' };
  } catch (error) {
    return failure(error);
  }
}
export async function decideCodeSuggestion(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const suggestionId = id(form, 'suggestionId');
    const decision = z.enum(['approved', 'rejected']).parse(field(form, 'decision'));
    const suggestion = await db.query.codeSuggestions.findFirst({
      where: eq(codeSuggestions.id, suggestionId),
    });
    if (!suggestion) throw new Error('Suggestion not found.');
    const file = await db.query.codeFiles.findFirst({ where: eq(codeFiles.id, suggestion.fileId) });
    if (!file) throw new Error('Code file not found.');
    const { user, project } = await access(file.sessionId, 'manage');
    await db.transaction(async (tx) => {
      const changed = await tx
        .update(codeSuggestions)
        .set({ status: decision, reviewedBy: user.id })
        .where(and(eq(codeSuggestions.id, suggestionId), eq(codeSuggestions.status, 'pending')))
        .returning({ id: codeSuggestions.id });
      if (!changed.length)
        throw new Error('This suggestion is no longer pending. Refresh the review.');
      await tx.insert(activityEvents).values({
        workspaceId: project.workspaceId,
        actorId: user.id,
        action: `code.${decision}`,
        objectType: 'code_suggestion',
        objectId: suggestionId,
      });
    });
    revalidatePath('/');
    return {
      success:
        decision === 'approved'
          ? 'Suggestion approved. Apply it when the team is ready.'
          : 'Suggestion rejected.',
    };
  } catch (error) {
    return failure(error);
  }
}
export async function applyCodeSuggestion(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const suggestionId = id(form, 'suggestionId');
    const suggestion = await db.query.codeSuggestions.findFirst({
      where: eq(codeSuggestions.id, suggestionId),
    });
    if (!suggestion || suggestion.status !== 'approved')
      throw new Error('Approved suggestion not found.');
    const file = await db.query.codeFiles.findFirst({ where: eq(codeFiles.id, suggestion.fileId) });
    if (!file) throw new Error('Code file not found.');
    const { user, project } = await access(file.sessionId, 'manage');
    const token = (await cookies()).get('flowstate_session')?.value;
    if (!token) return { error: 'Sign in first.' };
    await db.transaction(async (tx) => {
      // Two leads can click Apply at once. Serialize applications for the same file
      // and recheck the decision before connecting to the shared document.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`code-apply:${file.id}`}))`);
      const latest = await tx.query.codeSuggestions.findFirst({
        where: eq(codeSuggestions.id, suggestionId),
      });
      if (latest?.status === 'applied') return;
      if (!latest || latest.status !== 'approved')
        throw new Error('Approved suggestion not found.');
      await importRuntimeBuffers({
        requireManager: true,
        sessionId: file.sessionId,
        sessionHash: tokenHash(token),
        changes: [
          {
            path: file.path,
            baselineHash: suggestion.baselineHash,
            content: suggestion.proposedContent,
          },
        ],
        secret: process.env.COLLABORATION_SECRET || '',
        origin: new URL(process.env.APP_URL || 'http://localhost:3000').origin,
        collaborationURL: process.env.COLLABORATION_INTERNAL_URL || 'ws://127.0.0.1:1234',
      });
      const changed = await tx
        .update(codeSuggestions)
        .set({ status: 'applied' })
        .where(and(eq(codeSuggestions.id, suggestionId), eq(codeSuggestions.status, 'approved')))
        .returning({ id: codeSuggestions.id });
      if (changed.length)
        await tx.insert(activityEvents).values({
          workspaceId: project.workspaceId,
          actorId: user.id,
          action: 'code.applied',
          objectType: 'code_suggestion',
          objectId: suggestionId,
        });
    });
    revalidatePath('/');
    return {
      success: 'Approved suggestion saved to shared code. Publish a pull request when ready.',
    };
  } catch (error) {
    return failure(error);
  }
}

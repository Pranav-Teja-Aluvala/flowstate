'use server';
import { and, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import * as Y from 'yjs';
import { revalidatePath } from 'next/cache';
import {
  db,
  projects,
  repositories,
  codeSessions,
  codeFiles,
  codeStates,
  githubAccounts,
  activityEvents,
} from '@flowstate/database';
import {
  GitHubError,
  githubToken,
  githubFetch,
  repositoryAccess,
  repositoryPath,
  safeCodePath,
  readRepositoryFile,
  type GitHubRepository,
} from '@flowstate/github';
import { requireUser, requireMembership } from './auth';
import type { ActionState } from './actions';
const field = (form: FormData, key: string) => String(form.get(key) || '');
async function projectAccess(form: FormData, permission: 'read' | 'write' | 'manage' = 'read') {
  const projectId = z.uuid().parse(field(form, 'projectId'));
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) throw new GitHubError('Project not found.');
  return { project, ...(await requireMembership(project.workspaceId, permission)) };
}
function failure(error: unknown): ActionState {
  if (error instanceof z.ZodError) return { error: error.issues[0].message };
  if (error instanceof GitHubError) return { error: error.message };
  return { error: 'This code operation could not be completed. Please try again.' };
}
export async function connectRepository(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { project, user } = await projectAccess(form, 'manage');
    const installationId = z.string().regex(/^\d+$/).parse(field(form, 'installationId'));
    const repositoryId = z.string().regex(/^\d+$/).parse(field(form, 'repositoryId'));
    const token = await githubToken(user.id);
    // Only accept repositories in an installation explicitly available to this user's GitHub App token.
    let selected: GitHubRepository | undefined;
    for (let page = 1; page <= 20; page++) {
      const data = await githubFetch<{ repositories: GitHubRepository[] }>(
        token,
        `/user/installations/${installationId}/repositories?per_page=100&page=${page}`,
      );
      selected = data.repositories.find((r) => String(r.id) === repositoryId);
      if (selected || data.repositories.length < 100) break;
    }
    if (!selected?.permissions?.push)
      throw new GitHubError('Select an installed repository where you have GitHub write access.');
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${project.id}))`);
      const existing = await tx.query.repositories.findFirst({
        where: eq(repositories.projectId, project.id),
      });
      if (existing)
        throw new GitHubError(
          'This project already has a repository. Disconnect it before linking another.',
        );
      await tx.insert(repositories).values({
        projectId: project.id,
        repositoryId,
        installationId,
        owner: selected!.owner.login,
        name: selected!.name,
        defaultBranch: selected!.default_branch,
        connectedBy: user.id,
      });
      await tx.insert(activityEvents).values({
        workspaceId: project.workspaceId,
        actorId: user.id,
        action: 'repository.connected',
        objectType: 'project',
        objectId: project.id,
      });
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath('/');
  return { success: 'Repository connected.' };
}
export async function disconnectRepository(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { project } = await projectAccess(form, 'manage');
    const repository = await db.query.repositories.findFirst({
      where: eq(repositories.projectId, project.id),
    });
    if (!repository || field(form, 'confirmation') !== `${repository.owner}/${repository.name}`)
      return { error: 'Enter the exact repository name to confirm disconnection.' };
    await db.transaction(async (tx) => {
      await tx.delete(codeSessions).where(eq(codeSessions.projectId, project.id));
      await tx.delete(repositories).where(eq(repositories.projectId, project.id));
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath('/');
  return { success: 'Repository disconnected and local code sessions removed.' };
}
export async function disconnectGitHub(): Promise<ActionState> {
  const user = await requireUser();
  await db.delete(githubAccounts).where(eq(githubAccounts.userId, user.id));
  revalidatePath('/');
  return {
    success:
      'GitHub credentials removed from FLOWSTATE. You can also revoke the app in GitHub settings.',
  };
}
export async function startCodeSession(_state: ActionState, form: FormData): Promise<ActionState> {
  let destination: string;
  try {
    const { project, user } = await projectAccess(form, 'write');
    const { repo, token } = await repositoryAccess(user.id, project.id, true);
    const branch = z.string().min(1).max(200).parse(field(form, 'branch'));
    const commit = await githubFetch<{ sha: string }>(
      token,
      `${repositoryPath(repo)}/commits/${encodeURIComponent(branch)}`,
    );
    const [session] = await db
      .insert(codeSessions)
      .values({ projectId: project.id, branch, baseCommit: commit.sha, createdBy: user.id })
      .returning();
    destination = `/w/${project.workspaceId}/p/${project.id}/code?session=${session.id}`;
  } catch (error) {
    return failure(error);
  }
  revalidatePath('/');
  return { success: 'Shared code session started.', redirectTo: destination };
}
export async function openCodeFile(input: {
  projectId: string;
  sessionId: string;
  path: string;
}): Promise<{ fileId?: string; error?: string }> {
  try {
    const data = z
      .object({ projectId: z.uuid(), sessionId: z.uuid(), path: z.string() })
      .parse(input);
    safeCodePath(data.path);
    const form = new FormData();
    form.set('projectId', data.projectId);
    const { project, user } = await projectAccess(form, 'read');
    const { repo, token } = await repositoryAccess(user.id, project.id);
    const session = await db.query.codeSessions.findFirst({
      where: and(eq(codeSessions.id, data.sessionId), eq(codeSessions.projectId, project.id)),
    });
    if (!session) throw new GitHubError('Code session not found.');
    const existing = await db.query.codeFiles.findFirst({
      where: and(eq(codeFiles.sessionId, session.id), eq(codeFiles.path, data.path)),
    });
    if (existing) return { fileId: existing.id };
    const remote = await readRepositoryFile(token, repo, session.baseCommit, data.path);
    const content = remote.content;
    const [file] = await db
      .insert(codeFiles)
      .values({
        sessionId: session.id,
        path: data.path,
        initialContent: content,
        baseBlob: remote.sha,
        mode: remote.mode,
      })
      .onConflictDoUpdate({
        target: [codeFiles.sessionId, codeFiles.path],
        set: { path: data.path },
      })
      .returning();
    return { fileId: file.id };
  } catch (error) {
    return { error: failure(error).error };
  }
}
export async function publishPullRequest(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { project, user } = await projectAccess(form, 'write');
    const { repo, token } = await repositoryAccess(user.id, project.id, true);
    const sessionId = z.uuid().parse(field(form, 'sessionId'));
    const title = z.string().trim().min(1).max(150).parse(field(form, 'title'));
    const session = await db.query.codeSessions.findFirst({
      where: and(eq(codeSessions.id, sessionId), eq(codeSessions.projectId, project.id)),
    });
    if (!session) throw new GitHubError('Code session not found.');
    const head = await githubFetch<{ sha: string; commit: { tree: { sha: string } } }>(
      token,
      `${repositoryPath(repo)}/commits/${encodeURIComponent(session.branch)}`,
    );
    if (head.sha !== session.baseCommit)
      throw new GitHubError('The base branch changed. Start a new code session before publishing.');
    const files = await db.select().from(codeFiles).where(eq(codeFiles.sessionId, sessionId));
    const tree: { path: string; mode: '100644' | '100755'; type: 'blob'; content: string }[] = [];
    for (const file of files) {
      const state = await db.query.codeStates.findFirst({ where: eq(codeStates.fileId, file.id) });
      let content = file.initialContent;
      if (state) {
        const doc = new Y.Doc();
        Y.applyUpdate(doc, new Uint8Array(state.yjsState));
        content = doc.getText('code').toString();
        doc.destroy();
      }
      if (content !== file.initialContent)
        tree.push({
          path: safeCodePath(file.path),
          mode: file.mode === '100755' ? '100755' : '100644',
          type: 'blob',
          content,
        });
    }
    if (!tree.length) throw new GitHubError('There are no saved file changes to publish.');
    const branch = `flowstate/${session.id.slice(0, 8)}-${randomBytes(3).toString('hex')}`;
    const createdTree = await githubFetch<{ sha: string }>(
      token,
      `${repositoryPath(repo)}/git/trees`,
      { method: 'POST', body: { base_tree: head.commit.tree.sha, tree } },
    );
    const commit = await githubFetch<{ sha: string }>(
      token,
      `${repositoryPath(repo)}/git/commits`,
      { method: 'POST', body: { message: title, tree: createdTree.sha, parents: [head.sha] } },
    );
    await githubFetch(token, `${repositoryPath(repo)}/git/refs`, {
      method: 'POST',
      body: { ref: `refs/heads/${branch}`, sha: commit.sha },
    });
    const pr = await githubFetch<{ html_url: string }>(token, `${repositoryPath(repo)}/pulls`, {
      method: 'POST',
      body: {
        title,
        head: branch,
        base: session.branch,
        body: `Created from a FLOWSTATE shared code session.\n\n${tree.length} saved file(s) changed. Review and run your repository checks before merging.`,
      },
    });
    return { success: 'Pull request created.', link: pr.html_url };
  } catch (error) {
    return failure(error);
  }
}

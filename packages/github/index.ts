import { and, eq, gt } from 'drizzle-orm';
import {
  db,
  githubAccounts,
  repositories,
  codeSessions,
  codeFiles,
  memberships,
  sessions,
  users,
  projects,
} from '@flowstate/database';
import { encryptToken, decryptToken } from './security';
import { safeCodePath } from './security';
export { safeCodePath, encryptToken, decryptToken } from './security';
export class GitHubError extends Error {}
export type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  owner: { login: string };
  permissions?: { push?: boolean; admin?: boolean };
  html_url: string;
};
export type GitHubEntry = {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  sha: string;
  size: number;
  content?: string;
  encoding?: string;
};
type OAuthResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
};

export function githubConfigured() {
  return Boolean(
    process.env.GITHUB_CLIENT_ID &&
    process.env.GITHUB_CLIENT_SECRET &&
    /^[a-fA-F0-9]{64}$/.test(process.env.GITHUB_TOKEN_KEY || '') &&
    process.env.GITHUB_APP_SLUG,
  );
}
export async function exchangeOAuth(body: Record<string, string>) {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      ...body,
    }),
    signal: AbortSignal.timeout(15_000),
    redirect: 'error',
  });
  const data: OAuthResponse = await response.json();
  if (!response.ok || !data.access_token || data.error)
    throw new GitHubError('GitHub authorization failed. Please reconnect your account.');
  return data as OAuthResponse & { access_token: string };
}
export async function githubToken(userId: string) {
  return db.transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(githubAccounts)
      .where(eq(githubAccounts.userId, userId))
      .for('update');
    if (!account)
      throw new GitHubError('Connect your own GitHub account to access this repository.');
    if (!account.expiresAt || account.expiresAt.getTime() > Date.now() + 60_000)
      return decryptToken(account.accessToken);
    if (!account.refreshToken)
      throw new GitHubError('Your GitHub authorization expired. Reconnect your account.');
    const refreshed = await exchangeOAuth({
      grant_type: 'refresh_token',
      refresh_token: decryptToken(account.refreshToken),
    });
    await tx
      .update(githubAccounts)
      .set({
        accessToken: encryptToken(refreshed.access_token),
        refreshToken: refreshed.refresh_token
          ? encryptToken(refreshed.refresh_token)
          : account.refreshToken,
        expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null,
      })
      .where(eq(githubAccounts.userId, userId));
    return refreshed.access_token;
  });
}
export async function githubFetch<T>(
  token: string,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new GitHubError('Invalid GitHub API path.');
  const response = await fetch(`https://api.github.com${path}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2026-03-10',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    if ([401, 403, 404].includes(response.status))
      throw new GitHubError(
        'GitHub access was denied. Check your account, selected repositories, and repository permissions.',
      );
    if ([409, 422].includes(response.status))
      throw new GitHubError(
        'The repository changed or this operation conflicts with an existing branch. Reload and try again.',
      );
    throw new GitHubError('GitHub could not complete this request. Please try again.');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export const repositoryPath = (repo: { owner: string; name: string }) =>
  `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
export async function readRepositoryFile(
  token: string,
  repo: { owner: string; name: string },
  commitSha: string,
  path: string,
) {
  safeCodePath(path);
  const base = repositoryPath(repo);
  const commit = await githubFetch<{ tree: { sha: string } }>(
    token,
    `${base}/git/commits/${encodeURIComponent(commitSha)}`,
  );
  let treeSha = commit.tree.sha;
  const segments = path.split('/');
  for (let i = 0; i < segments.length; i++) {
    const tree = await githubFetch<{
      tree: { path: string; type: string; mode: string; sha: string; size?: number }[];
    }>(token, `${base}/git/trees/${treeSha}`);
    const entry = tree.tree.find((file) => file.path === segments[i]);
    if (!entry) throw new GitHubError('Repository file not found.');
    if (i < segments.length - 1) {
      if (entry.type !== 'tree') throw new GitHubError('Choose a regular repository file.');
      treeSha = entry.sha;
      continue;
    }
    if (
      entry.type !== 'blob' ||
      !['100644', '100755'].includes(entry.mode) ||
      (entry.size || 0) > 256 * 1024
    )
      throw new GitHubError(
        'Choose a regular text file up to 256 KiB. Symlinks and submodules cannot be edited.',
      );
    const blob = await githubFetch<{ encoding: string; content: string }>(
      token,
      `${base}/git/blobs/${entry.sha}`,
    );
    if (blob.encoding !== 'base64') throw new GitHubError('Unsupported file encoding.');
    const bytes = Buffer.from(blob.content, 'base64');
    if (bytes.byteLength > 256 * 1024) throw new GitHubError('Choose a text file up to 256 KiB.');
    let content: string;
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new GitHubError('Binary files cannot be edited.');
    }
    if (content.includes('\0')) throw new GitHubError('Binary files cannot be edited.');
    return { content, sha: entry.sha, mode: entry.mode };
  }
  throw new GitHubError('Repository file not found.');
}
export async function repositoryAccess(userId: string, projectId: string, write = false) {
  const repo = await db.query.repositories.findFirst({
    where: eq(repositories.projectId, projectId),
  });
  if (!repo) throw new GitHubError('Connect a GitHub repository in project settings first.');
  const token = await githubToken(userId);
  const remote = await githubFetch<GitHubRepository>(token, repositoryPath(repo));
  if (String(remote.id) !== repo.repositoryId || (write && !remote.permissions?.push))
    throw new GitHubError('You do not have the required GitHub repository permission.');
  return { repo, remote, token };
}
// A short positive cache limits GitHub API traffic. Local session/membership checks still run on each message.
const codeAccessCache = new Map<string, { expires: number; write: boolean }>();
export async function authorizeCodeSession(codeSessionId: string, sessionHash: string) {
  const [row] = await db
    .select({
      userId: users.id,
      name: users.name,
      role: memberships.role,
      projectId: codeSessions.projectId,
      sessionId: codeSessions.id,
      repositoryId: repositories.repositoryId,
      githubId: githubAccounts.githubId,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(githubAccounts, eq(githubAccounts.userId, users.id))
    .innerJoin(codeSessions, eq(codeSessions.id, codeSessionId))
    .innerJoin(projects, eq(projects.id, codeSessions.projectId))
    .innerJoin(repositories, eq(repositories.projectId, projects.id))
    .innerJoin(
      memberships,
      and(eq(memberships.workspaceId, projects.workspaceId), eq(memberships.userId, users.id)),
    )
    .where(and(eq(sessions.tokenHash, sessionHash), gt(sessions.expiresAt, new Date())));
  if (!row) throw new GitHubError('Access denied');
  const key = row.userId + ':' + row.projectId + ':' + row.repositoryId + ':' + row.githubId;
  let access = codeAccessCache.get(key);
  if (!access || access.expires < Date.now()) {
    const { remote } = await repositoryAccess(row.userId, row.projectId);
    access = { expires: Date.now() + 30_000, write: Boolean(remote.permissions?.push) };
    if (codeAccessCache.size > 1000) codeAccessCache.clear();
    codeAccessCache.set(key, access);
  }
  return {
    ...row,
    role: row.role === 'viewer' || !access.write ? 'viewer' : row.role,
    sessionHash,
  };
}
export async function authorizeCode(fileId: string, sessionHash: string) {
  const file = await db.query.codeFiles.findFirst({ where: eq(codeFiles.id, fileId) });
  if (!file) throw new GitHubError('Access denied');
  return { ...(await authorizeCodeSession(file.sessionId, sessionHash)), fileId };
}

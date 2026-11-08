import { RunnerError } from './policy';
import { eq } from 'drizzle-orm';
import * as Y from 'yjs';
import { db, codeSessions, codeFiles, codeStates } from '@flowstate/database';
import { repositoryAccess, repositoryPath, githubFetch, safeCodePath } from '@flowstate/github';
export type SnapshotFile = { path: string; content: Buffer; mode: number };
export async function repositorySnapshot(
  userId: string,
  sessionId: string,
): Promise<SnapshotFile[]> {
  const session = await db.query.codeSessions.findFirst({ where: eq(codeSessions.id, sessionId) });
  if (!session) throw new RunnerError('Code session no longer exists.');
  const { repo, token } = await repositoryAccess(userId, session.projectId);
  const base = repositoryPath(repo);
  const commit = await githubFetch<{ tree: { sha: string } }>(
    token,
    `${base}/git/commits/${session.baseCommit}`,
  );
  const tree = await githubFetch<{
    truncated: boolean;
    tree: { path: string; mode: string; type: string; sha: string; size?: number }[];
  }>(token, `${base}/git/trees/${commit.tree.sha}?recursive=1`);
  const regular = tree.tree.filter((file) => file.type !== 'tree');
  if (
    tree.truncated ||
    regular.length > 500 ||
    regular.some(
      (file) =>
        !['100644', '100755'].includes(file.mode) ||
        file.type !== 'blob' ||
        (file.size || 0) > 1024 * 1024,
    ) ||
    regular.reduce((n, f) => n + (f.size || 0), 0) > 20 * 1024 * 1024
  )
    throw new RunnerError(
      'This runner supports up to 500 regular files, 1 MiB per file and 20 MiB total. Symlinks and submodules are not supported.',
    );
  const files: SnapshotFile[] = [];
  // Bound concurrency and keep tokens in this process, never inside the container.
  for (let index = 0; index < regular.length; index += 5)
    await Promise.all(
      regular.slice(index, index + 5).map(async (file) => {
        const blob = await githubFetch<{ encoding: string; content: string }>(
          token,
          `${base}/git/blobs/${file.sha}`,
        );
        if (blob.encoding !== 'base64') throw new RunnerError('Unsupported repository file.');
        files.push({
          path: safeCodePath(file.path),
          content: Buffer.from(blob.content, 'base64'),
          mode: file.mode === '100755' ? 0o755 : 0o644,
        });
      }),
    );
  const changed = await db.select().from(codeFiles).where(eq(codeFiles.sessionId, sessionId));
  for (const file of changed) {
    const state = await db.query.codeStates.findFirst({ where: eq(codeStates.fileId, file.id) });
    let content = file.initialContent;
    if (state) {
      const doc = new Y.Doc();
      Y.applyUpdate(doc, new Uint8Array(state.yjsState));
      content = doc.getText('code').toString();
      doc.destroy();
    }
    const target = files.find((f) => f.path === file.path);
    if (target) target.content = Buffer.from(content);
  }
  if (files.reduce((n, file) => n + file.content.byteLength, 0) > 20 * 1024 * 1024)
    throw new RunnerError('Saved code exceeds the runner snapshot limit.');
  return files;
}

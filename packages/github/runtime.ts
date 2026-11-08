import { createHash, createHmac } from 'node:crypto';
import { WebSocket } from 'ws';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, codeFiles, codeSessions } from '@flowstate/database';
import {
  authorizeCodeSession,
  repositoryAccess,
  readRepositoryFile,
  safeCodePath,
  GitHubError,
} from './index';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const changeSchema = z
  .array(
    z.object({
      path: z.string().max(500),
      baselineHash: z.string().regex(/^[a-f0-9]{64}$/),
      content: z
        .string()
        .refine(
          (value) => Buffer.byteLength(value) <= 256 * 1024 && !value.includes('\0'),
          'Choose UTF-8 text up to 256 KiB.',
        ),
    }),
  )
  .min(1)
  .max(20);
async function until(check: () => boolean, timeout = 12_000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout)
      throw new GitHubError(
        'Collaboration import timed out. Reopen the editor to check saved changes.',
      );
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
export async function importRuntimeBuffers(input: {
  sessionId: string;
  sessionHash: string;
  changes: unknown;
  collaborationURL: string;
  origin: string;
  secret: string;
}) {
  const changes = changeSchema.parse(input.changes);
  if (
    new Set(changes.map((change) => change.path)).size !== changes.length ||
    changes.reduce((size, change) => size + Buffer.byteLength(change.content), 0) > 512 * 1024
  )
    throw new GitHubError('Review unique files up to 512 KiB in total.');
  if (input.secret.length < 32) throw new GitHubError('Collaboration is not configured.');
  const access = await authorizeCodeSession(input.sessionId, input.sessionHash);
  if (access.role === 'viewer')
    throw new GitHubError('You do not have permission to import runtime changes.');
  const session = await db.query.codeSessions.findFirst({
    where: eq(codeSessions.id, input.sessionId),
  });
  if (!session) throw new GitHubError('Code session not found.');
  const clients: {
    provider: HocuspocusProvider;
    socket: HocuspocusProviderWebsocket;
    document: Y.Doc;
    content: string;
    baselineHash: string;
  }[] = [];
  class BrowserSocket extends WebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols, { origin: input.origin });
    }
  }
  try {
    for (const change of changes) {
      const path = safeCodePath(change.path);
      let file = await db.query.codeFiles.findFirst({
        where: and(eq(codeFiles.sessionId, input.sessionId), eq(codeFiles.path, path)),
      });
      if (!file) {
        const { repo, token } = await repositoryAccess(access.userId, access.projectId, true);
        const source = await readRepositoryFile(token, repo, session.baseCommit, path);
        await db
          .insert(codeFiles)
          .values({
            sessionId: input.sessionId,
            path,
            initialContent: source.content,
            baseBlob: source.sha,
            mode: source.mode,
          })
          .onConflictDoNothing();
        file = await db.query.codeFiles.findFirst({
          where: and(eq(codeFiles.sessionId, input.sessionId), eq(codeFiles.path, path)),
        });
      }
      if (!file) throw new GitHubError('Repository file unavailable.');
      const documentId = `code:${file.id}`;
      const payload = Buffer.from(
        JSON.stringify({
          documentId,
          sessionHash: input.sessionHash,
          expiresAt: Date.now() + 60_000,
        }),
      ).toString('base64url');
      const document = new Y.Doc();
      const socket = new HocuspocusProviderWebsocket({
        url: input.collaborationURL,
        WebSocketPolyfill: BrowserSocket,
        maxAttempts: 1,
      });
      const provider = new HocuspocusProvider({
        websocketProvider: socket,
        name: documentId,
        document,
        token: `${payload}.${createHmac('sha256', input.secret).update(payload).digest('base64url')}`,
      });
      provider.attach();
      clients.push({
        provider,
        socket,
        document,
        content: change.content,
        baselineHash: change.baselineHash,
      });
      await until(() => provider.isSynced);
    }
    // Check every baseline before changing any shared buffer.
    for (const client of clients) {
      const current = client.document.getText('code').toString();
      if (current !== client.content && hash(current) !== client.baselineHash)
        throw new GitHubError(
          'Shared code changed since the terminal snapshot. Review both versions before importing.',
        );
    }
    const latest = await authorizeCodeSession(input.sessionId, input.sessionHash);
    if (latest.role === 'viewer') throw new GitHubError('Import permission was revoked.');
    for (const client of clients) {
      const text = client.document.getText('code');
      if (text.toString() === client.content) continue;
      client.document.transact(() => {
        text.delete(0, text.length);
        text.insert(0, client.content);
      });
      await until(() => !client.provider.hasUnsyncedChanges);
    }
    return clients.length;
  } finally {
    clients.forEach((client) => {
      client.provider.destroy();
      client.socket.destroy();
      client.document.destroy();
    });
  }
}

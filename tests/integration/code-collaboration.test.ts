import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { eq } from 'drizzle-orm';
import {
  db,
  pool,
  users,
  sessions,
  workspaces,
  memberships,
  projects,
  repositories,
  codeSessions,
  codeFiles,
  codeStates,
  githubAccounts,
} from '../../packages/database';
import { encryptToken, authorizeCodeSession } from '../../packages/github';
import { createCollaborationServer } from '../../apps/collaboration/src/server';
import { importRuntimeBuffers } from '../../packages/github/runtime';
const secret = randomBytes(32).toString('hex');
const hashes = new Map<string, string>();
const clients: {
  provider: HocuspocusProvider;
  socket: HocuspocusProviderWebsocket;
  document: Y.Doc;
}[] = [];
let app: ReturnType<typeof createCollaborationServer>;
let owner: string;
let editor: string;
let viewer: string;
let outsider: string;
let workspaceId: string;
let otherWorkspaceId: string;
let fileId: string;
let codeSessionId: string;
async function until(check: () => boolean | Promise<boolean>, timeout = 10_000) {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeout) throw new Error('Condition timed out');
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}
function connect(userId: string) {
  const payload = Buffer.from(
    JSON.stringify({
      documentId: `code:${fileId}`,
      sessionHash: hashes.get(userId),
      expiresAt: Date.now() + 60_000,
    }),
  ).toString('base64url');
  const token = `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
  class BrowserSocket extends WebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols, { origin: 'http://localhost:3000' });
    }
  }
  const socket = new HocuspocusProviderWebsocket({
    url: 'ws://127.0.0.1:1237',
    WebSocketPolyfill: BrowserSocket,
    maxAttempts: 1,
  });
  const document = new Y.Doc();
  const provider = new HocuspocusProvider({
    websocketProvider: socket,
    name: `code:${fileId}`,
    document,
    token,
  });
  provider.attach();
  const client = { provider, socket, document };
  clients.push(client);
  return client;
}
beforeAll(async () => {
  vi.stubEnv('GITHUB_TOKEN_KEY', randomBytes(32).toString('hex'));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/repos/company/private-code'))
        return Response.json({ id: 12345, permissions: { push: true } });
      throw new Error('Unexpected external API request in test.');
    }),
  );
  const suffix = randomBytes(6).toString('hex');
  const accounts = await db
    .insert(users)
    .values(
      ['owner', 'editor', 'viewer', 'outsider'].map((name) => ({
        name,
        email: `code-${name}-${suffix}@test.local`,
        passwordHash: 'test-only-unused',
      })),
    )
    .returning();
  [owner, editor, viewer, outsider] = accounts.map((user) => user.id);
  for (const user of accounts) {
    const hash = createHash('sha256').update(randomBytes(32)).digest('hex');
    hashes.set(user.id, hash);
    await db
      .insert(sessions)
      .values({ userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + 3600_000) });
    await db.insert(githubAccounts).values({
      userId: user.id,
      githubId: user.id,
      login: user.name,
      accessToken: encryptToken(`fake-${user.name}`),
    });
  }
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: 'Code integration', slug: `code-${suffix}`, ownerId: owner })
    .returning();
  workspaceId = workspace.id;
  const [other] = await db
    .insert(workspaces)
    .values({ name: 'Unrelated workspace', slug: `other-${suffix}`, ownerId: viewer })
    .returning();
  otherWorkspaceId = other.id;
  await db.insert(memberships).values([
    { workspaceId, userId: owner, role: 'owner' },
    { workspaceId, userId: editor, role: 'editor' },
    { workspaceId, userId: viewer, role: 'viewer' },
    { workspaceId: otherWorkspaceId, userId: viewer, role: 'owner' },
  ]);
  const [project] = await db
    .insert(projects)
    .values({ workspaceId, name: 'Private company code', createdBy: owner })
    .returning();
  await db.insert(repositories).values({
    projectId: project.id,
    repositoryId: '12345',
    installationId: '123',
    owner: 'company',
    name: 'private-code',
    defaultBranch: 'main',
    connectedBy: owner,
  });
  const [session] = await db
    .insert(codeSessions)
    .values({ projectId: project.id, branch: 'main', baseCommit: 'a'.repeat(40), createdBy: owner })
    .returning();
  codeSessionId = session.id;
  const [file] = await db
    .insert(codeFiles)
    .values({
      sessionId: session.id,
      path: 'src/index.ts',
      initialContent: 'export const version = 1;\n',
      baseBlob: 'b'.repeat(40),
    })
    .returning();
  fileId = file.id;
  app = createCollaborationServer({ port: 1237, origins: ['http://localhost:3000'], secret });
  await app.server.listen();
});
afterAll(async () => {
  clients.forEach((c) => {
    c.provider.destroy();
    c.socket.destroy();
    c.document.destroy();
  });
  await app?.destroy();
  for (const id of [workspaceId, otherWorkspaceId].filter(Boolean))
    await db.delete(workspaces).where(eq(workspaces.id, id));
  for (const id of [owner, editor, viewer, outsider].filter(Boolean))
    await db.delete(users).where(eq(users.id, id));
  await pool.end();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('shared private code rooms with a mocked GitHub permission API', () => {
  it('initializes source once, converges two users and restores saved code after restart', async () => {
    const a = connect(owner);
    const b = connect(editor);
    await until(() => a.provider.isSynced && b.provider.isSynced);
    expect(a.document.getText('code').toString()).toBe('export const version = 1;\n');
    a.document.getText('code').insert(a.document.getText('code').length, '// owner\n');
    b.document.getText('code').insert(b.document.getText('code').length, '// editor\n');
    await until(
      () =>
        a.document.getText('code').toString() === b.document.getText('code').toString() &&
        a.document.getText('code').length === 45,
    );
    const expected = a.document.getText('code').toString();
    await until(async () => {
      const row = await db.query.codeStates.findFirst({ where: eq(codeStates.fileId, fileId) });
      if (!row) return false;
      const doc = new Y.Doc();
      Y.applyUpdate(doc, new Uint8Array(row.yjsState));
      const same = doc.getText('code').toString() === expected;
      doc.destroy();
      return same;
    });
    a.provider.destroy();
    b.provider.destroy();
    await app.destroy();
    app = createCollaborationServer({ port: 1237, origins: ['http://localhost:3000'], secret });
    await app.server.listen();
    const restored = connect(owner);
    await until(() => restored.provider.isSynced);
    expect(restored.document.getText('code').toString()).toBe(expected);
  });
  it('does not inherit ownership from another workspace and rejects viewer code writes', async () => {
    expect((await authorizeCodeSession(codeSessionId, hashes.get(viewer)!)).role).toBe('viewer');
    const read = connect(viewer);
    const write = connect(owner);
    await until(() => read.provider.isSynced && write.provider.isSynced);
    read.document.getText('code').insert(0, 'FORBIDDEN');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(write.document.getText('code').toString()).not.toContain('FORBIDDEN');
  });
  it('imports reviewed terminal edits live, persists them and rejects stale baselines or viewer imports', async () => {
    const client = connect(owner);
    await until(() => client.provider.isSynced);
    const before = client.document.getText('code').toString();
    const content = before + '// imported runtime edit\n';
    const input = {
      sessionId: codeSessionId,
      sessionHash: hashes.get(owner)!,
      changes: [
        {
          path: 'src/index.ts',
          baselineHash: createHash('sha256').update(before).digest('hex'),
          content,
        },
      ],
      collaborationURL: 'ws://127.0.0.1:1237',
      origin: 'http://localhost:3000',
      secret,
    };
    expect(await importRuntimeBuffers(input)).toBe(1);
    await until(() => client.document.getText('code').toString() === content);
    await until(async () => {
      const saved = await db.query.codeStates.findFirst({ where: eq(codeStates.fileId, fileId) });
      const doc = new Y.Doc();
      if (saved) Y.applyUpdate(doc, new Uint8Array(saved.yjsState));
      const matches = doc.getText('code').toString() === content;
      doc.destroy();
      return matches;
    });
    await expect(
      importRuntimeBuffers({
        ...input,
        changes: [{ ...input.changes[0], content: 'stale replacement' }],
      }),
    ).rejects.toThrow('Shared code changed');
    await expect(
      importRuntimeBuffers({ ...input, sessionHash: hashes.get(viewer)! }),
    ).rejects.toThrow('permission');
    expect(client.document.getText('code').toString()).toBe(content);
  });
  it('rejects non-members even when their GitHub identity has repository access', async () => {
    const client = connect(outsider);
    let denied = false;
    client.provider.on('authenticationFailed', () => {
      denied = true;
    });
    await until(() => denied);
    expect(client.provider.isSynced).toBe(false);
  });
  it('revokes an active code room when the user removes their GitHub connection', async () => {
    const client = connect(editor);
    await until(() => client.provider.isSynced);
    let closed = false;
    client.provider.configuration.onClose = () => {
      closed = true;
    };
    await db.delete(githubAccounts).where(eq(githubAccounts.userId, editor));
    await until(() => closed, 5000);
  });
});

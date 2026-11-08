import 'dotenv/config';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { and, eq } from 'drizzle-orm';
import {
  db,
  pool,
  users,
  sessions,
  workspaces,
  memberships,
  projects,
  documents,
  documentStates,
} from '../../packages/database';
import { createCollaborationServer } from '../../apps/collaboration/src/server';

const secret = randomBytes(32).toString('hex');
const origin = 'http://localhost:3000';
let app: ReturnType<typeof createCollaborationServer>;
let documentId: string;
let workspaceId: string;
let editorId: string;
let viewerId: string;
const tokens = new Map<string, string>();
const providers: HocuspocusProvider[] = [];
const sockets: HocuspocusProviderWebsocket[] = [];
const docs: Y.Doc[] = [];
async function until(check: () => boolean | Promise<boolean>, timeout = 10_000) {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeout) throw new Error('Condition timed out');
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}
function ticket(userId: string, target = documentId, expiresAt = Date.now() + 60_000) {
  const payload = Buffer.from(
    JSON.stringify({ documentId: target, sessionHash: tokens.get(userId), expiresAt }),
  ).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
function connect(userId: string, options: { origin?: string; token?: string; name?: string } = {}) {
  class BrowserSocket extends WebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols, { origin: options.origin || origin });
    }
  }
  const websocketProvider = new HocuspocusProviderWebsocket({
    url: 'ws://127.0.0.1:1235',
    WebSocketPolyfill: BrowserSocket,
    maxAttempts: 1,
  });
  const document = new Y.Doc();
  const provider = new HocuspocusProvider({
    websocketProvider,
    name: options.name || documentId,
    document,
    token: options.token || ticket(userId),
  });
  provider.attach();
  providers.push(provider);
  sockets.push(websocketProvider);
  docs.push(document);
  return { provider, document };
}
beforeAll(async () => {
  const suffix = randomBytes(8).toString('hex');
  const accounts = await db
    .insert(users)
    .values([
      { name: 'Integration Editor', email: `editor-${suffix}@test.local`, passwordHash: 'unused' },
      { name: 'Integration Viewer', email: `viewer-${suffix}@test.local`, passwordHash: 'unused' },
    ])
    .returning();
  [editorId, viewerId] = accounts.map((a) => a.id);
  for (const user of accounts) {
    const token = createHash('sha256').update(randomBytes(32)).digest('hex');
    tokens.set(user.id, token);
    await db
      .insert(sessions)
      .values({ userId: user.id, tokenHash: token, expiresAt: new Date(Date.now() + 3600_000) });
  }
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: 'Collaboration tests', slug: `test-${suffix}`, ownerId: editorId })
    .returning();
  workspaceId = workspace.id;
  await db.insert(memberships).values([
    { workspaceId, userId: editorId, role: 'owner' },
    { workspaceId, userId: viewerId, role: 'viewer' },
  ]);
  const [project] = await db
    .insert(projects)
    .values({ workspaceId, name: 'Test project', createdBy: editorId })
    .returning();
  const [document] = await db
    .insert(documents)
    .values({ projectId: project.id, title: 'Test document', createdBy: editorId })
    .returning();
  documentId = document.id;
  app = createCollaborationServer({ port: 1235, origins: [origin], secret });
  await app.server.listen();
});
afterAll(async () => {
  providers.forEach((p) => p.destroy());
  sockets.forEach((s) => s.destroy());
  docs.forEach((d) => d.destroy());
  await app?.destroy();
  if (workspaceId) await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  for (const id of [editorId, viewerId].filter(Boolean))
    await db.delete(users).where(eq(users.id, id));
  await pool.end();
});
describe('real collaboration server and PostgreSQL', () => {
  it('converges simultaneous clients and recovers binary content after server restart', async () => {
    const a = connect(editorId);
    const b = connect(editorId);
    await until(() => a.provider.isSynced && b.provider.isSynced);
    a.document.getText('test').insert(0, 'alpha ');
    b.document.getText('test').insert(0, 'beta ');
    await until(
      () =>
        a.document.getText('test').toString() === b.document.getText('test').toString() &&
        a.document.getText('test').length === 11,
    );
    const expected = a.document.getText('test').toString();
    await until(async () => {
      const state = await db.query.documentStates.findFirst({
        where: eq(documentStates.documentId, documentId),
      });
      if (!state) return false;
      const recovered = new Y.Doc();
      Y.applyUpdate(recovered, new Uint8Array(state.yjsState));
      const content = recovered.getText('test').toString();
      recovered.destroy();
      return content === expected;
    });
    a.provider.destroy();
    b.provider.destroy();
    await app.destroy();
    app = createCollaborationServer({ port: 1235, origins: [origin], secret });
    await app.server.listen();
    const recovered = connect(editorId);
    await until(() => recovered.provider.isSynced);
    expect(recovered.document.getText('test').toString()).toBe(expected);
  });
  it('rejects viewer updates sent directly over the protocol', async () => {
    const viewer = connect(viewerId);
    const editor = connect(editorId);
    await until(() => viewer.provider.isSynced && editor.provider.isSynced);
    viewer.document.getText('test').insert(0, 'FORBIDDEN');
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(editor.document.getText('test').toString()).not.toContain('FORBIDDEN');
    const state = await db.query.documentStates.findFirst({
      where: eq(documentStates.documentId, documentId),
    });
    const stored = new Y.Doc();
    Y.applyUpdate(stored, new Uint8Array(state!.yjsState));
    expect(stored.getText('test').toString()).not.toContain('FORBIDDEN');
    stored.destroy();
  });
  it('reconciles edits made during a transient connection outage', async () => {
    const client = connect(editorId);
    await until(() => client.provider.isSynced);
    client.provider.configuration.websocketProvider.disconnect();
    await until(() => !client.provider.isSynced);
    client.document.getText('test').insert(0, 'offline ');
    void client.provider.configuration.websocketProvider.connect();
    await until(() => client.provider.isSynced && !client.provider.hasUnsyncedChanges);
    const another = connect(editorId);
    await until(() => another.provider.isSynced);
    expect(another.document.getText('test').toString()).toContain('offline ');
  });
  it('rejects hostile Origin before websocket upgrade', async () => {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket('ws://127.0.0.1:1235', { origin: 'https://evil.example' });
      socket.on('unexpected-response', (_request, response) => {
        expect(response.statusCode).toBe(403);
        socket.terminate();
        resolve();
      });
      socket.on('open', () => {
        socket.terminate();
        reject(new Error('Hostile Origin accepted'));
      });
      socket.on('error', () => {});
    });
  });
  it('rejects tampered and expired tickets and unauthorized rooms', async () => {
    for (const token of [
      ticket(editorId) + 'tampered',
      ticket(editorId, documentId, Date.now() - 1000),
      ticket(editorId, '00000000-0000-4000-8000-000000000000'),
    ]) {
      const client = connect(editorId, { token });
      let rejected = false;
      client.provider.on('authenticationFailed', () => {
        rejected = true;
      });
      await until(() => rejected);
      expect(client.provider.isSynced).toBe(false);
      client.provider.destroy();
    }
  });
  it('disconnects revoked members and rejects reconnect', async () => {
    const client = connect(viewerId);
    await until(() => client.provider.isSynced);
    await db
      .delete(memberships)
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, viewerId)));
    let disconnected = false;
    client.provider.configuration.onClose = () => {
      disconnected = true;
    };
    await until(() => disconnected, 5000);
    client.provider.destroy();
    const reconnect = connect(viewerId);
    let rejected = false;
    reconnect.provider.on('authenticationFailed', () => {
      rejected = true;
    });
    await until(() => rejected);
    expect(reconnect.provider.isSynced).toBe(false);
  });
  it('rejects oversized WebSocket frames', async () => {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket('ws://127.0.0.1:1235', { origin });
      socket.on('open', () => socket.send(Buffer.alloc(1024 * 1024 + 1)));
      socket.on('close', (code) => {
        if (code === 1009) resolve();
        else reject(new Error(`Unexpected close code ${code}`));
      });
      socket.on('error', () => {});
    });
  });
  it('expires active sessions and denies subsequent admission', async () => {
    const client = connect(editorId);
    await until(() => client.provider.isSynced);
    let closed = false;
    client.provider.configuration.onClose = () => {
      closed = true;
    };
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, editorId));
    await until(() => closed, 5000);
    client.provider.destroy();
    const expired = connect(editorId);
    let rejected = false;
    expired.provider.on('authenticationFailed', () => {
      rejected = true;
    });
    await until(() => rejected);
    expect(expired.provider.isSynced).toBe(false);
  });
});

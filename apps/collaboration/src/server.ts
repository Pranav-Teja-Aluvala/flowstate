import { createHmac, timingSafeEqual } from 'node:crypto';
import { Server, type Connection } from '@hocuspocus/server';
import { and, eq, gt, sql } from 'drizzle-orm';
import * as Y from 'yjs';
import { z } from 'zod';
import {
  db,
  sessions,
  users,
  memberships,
  projects,
  documents,
  documentStates,
} from '@flowstate/database';

export type Context = {
  sessionHash: string;
  userId: string;
  name: string;
  color: string;
  role: string;
};
const colors = ['#657e54', '#b1865c', '#6c8d9a', '#a67682', '#8d83ad'];
export async function authorize(documentId: string, sessionHash: string) {
  if (!z.uuid().safeParse(documentId).success) throw new Error('Access denied');
  const [access] = await db
    .select({ userId: users.id, name: users.name, role: memberships.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .innerJoin(projects, eq(projects.workspaceId, memberships.workspaceId))
    .innerJoin(documents, eq(documents.projectId, projects.id))
    .where(
      and(
        eq(sessions.tokenHash, sessionHash),
        gt(sessions.expiresAt, new Date()),
        eq(documents.id, documentId),
      ),
    );
  if (!access) throw new Error('Access denied');
  return {
    ...access,
    sessionHash,
    color: colors[parseInt(access.userId.slice(0, 8), 16) % colors.length],
  };
}
export function createCollaborationServer({
  port = 1234,
  origins,
  secret,
}: {
  port?: number;
  origins: string[];
  secret: string;
}) {
  if (secret.length < 32) throw new Error('COLLABORATION_SECRET must have at least 32 characters.');
  const connections = new Map<Connection<Context>, { documentId: string; context: Context }>();
  const saving = new Map<string, Promise<void>>();
  async function persist(documentId: string, state: Uint8Array) {
    const previous = saving.get(documentId) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        await db.transaction(async (tx) => {
          // One writer per document, including independent processes doing stores.
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${documentId}))`);
          const existing = await tx.query.documentStates.findFirst({
            where: eq(documentStates.documentId, documentId),
          });
          const merged = existing
            ? Y.mergeUpdates([new Uint8Array(existing.yjsState), state])
            : state;
          if (merged.byteLength > 8 * 1024 * 1024) throw new Error('Document size limit reached');
          const probe = new Y.Doc();
          try {
            Y.applyUpdate(probe, merged);
          } finally {
            probe.destroy();
          }
          await tx
            .insert(documentStates)
            .values({ documentId, yjsState: Buffer.from(merged) })
            .onConflictDoUpdate({
              target: documentStates.documentId,
              set: {
                yjsState: Buffer.from(merged),
                savedAt: new Date(),
                revision: sql`${documentStates.revision} + 1`,
              },
            });
        });
      });
    saving.set(documentId, next);
    try {
      await next;
    } finally {
      if (saving.get(documentId) === next) saving.delete(documentId);
    }
  }
  const server = new Server<Context>({
    port,
    address: '0.0.0.0',
    quiet: true,
    debounce: 250,
    maxDebounce: 1000,
    websocketOptions: { maxPayload: 1024 * 1024, maxFragments: 64, maxBufferedChunks: 128 },
    async onUpgrade({ request, socket }) {
      if (!request.headers.origin || !origins.includes(request.headers.origin)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return Promise.reject();
      }
    },
    async onAuthenticate({ token, documentName, connectionConfig }) {
      const [payload, signature] = token.split('.');
      if (!payload || !signature || token.length > 2048) throw new Error('Access denied');
      const expected = createHmac('sha256', secret).update(payload).digest();
      const received = Buffer.from(signature, 'base64url');
      if (received.length !== expected.length || !timingSafeEqual(expected, received))
        throw new Error('Access denied');
      const data = z
        .object({ documentId: z.uuid(), sessionHash: z.string().length(64), expiresAt: z.number() })
        .parse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
      if (data.documentId !== documentName || data.expiresAt < Date.now())
        throw new Error('Access denied');
      const context = await authorize(documentName, data.sessionHash);
      connectionConfig.readOnly = context.role === 'viewer';
      return context;
    },
    async connected({ connection, documentName, context }) {
      connections.set(connection, { documentId: documentName, context });
      connection.onClose(() => {
        connections.delete(connection);
      });
    },
    async beforeHandleMessage({ context, documentName, connection, update }) {
      if (update.byteLength > 1024 * 1024) throw new Error('Payload too large');
      const access = await authorize(documentName, context.sessionHash);
      connection.readOnly = access.role === 'viewer';
    },
    async beforeHandleAwareness({ context, states }) {
      if (!context) return;
      for (const state of states.values())
        state.user = { id: context.userId, name: context.name, color: context.color };
    },
    async beforeSync({ documentName, type, payload, connection }) {
      // Commit inbound CRDT updates before Hocuspocus applies, broadcasts, or acknowledges them.
      // Sync step 1 is only a state vector; steps 2 and update contain binary updates.
      if ((type === 1 || type === 2) && !connection.readOnly) {
        try {
          await persist(documentName, payload);
        } catch {
          throw new Error('Document update could not be saved.');
        }
      }
    },
    async onLoadDocument({ documentName, document }) {
      const state = await db.query.documentStates.findFirst({
        where: eq(documentStates.documentId, documentName),
      });
      if (state) Y.applyUpdate(document, new Uint8Array(state.yjsState));
    },
    async onChange({ documentName, document }) {
      try {
        await persist(documentName, Y.encodeStateAsUpdate(document));
        document.broadcastStateless(JSON.stringify({ type: 'saved' }));
      } catch {
        document.broadcastStateless(JSON.stringify({ type: 'save-error' }));
      }
    },
    async onStoreDocument({ documentName, document }) {
      try {
        await persist(documentName, Y.encodeStateAsUpdate(document));
      } catch {
        throw new Error('Document state could not be saved.');
      }
      document.broadcastStateless(JSON.stringify({ type: 'saved' }));
    },
  });
  // Idle connections must lose access too; do not wait for their next edit.
  const timer = setInterval(() => {
    for (const [connection, data] of connections)
      void authorize(data.documentId, data.context.sessionHash)
        .then((access) => {
          if (access.role !== data.context.role)
            connection.close({ code: 4403, reason: 'Permissions changed' });
        })
        .catch(() => connection.close({ code: 4403, reason: 'Access expired' }));
  }, 2000);
  timer.unref();
  return {
    server,
    async destroy() {
      clearInterval(timer);
      await server.destroy();
      await Promise.allSettled(saving.values());
    },
  };
}

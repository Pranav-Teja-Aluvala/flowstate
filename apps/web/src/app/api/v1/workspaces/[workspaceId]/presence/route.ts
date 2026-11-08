import { cookies } from 'next/headers';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  db,
  memberships,
  sessions,
  users,
  workspacePresence,
  activityEvents,
} from '@flowstate/database';
import { currentUser, tokenHash } from '@/lib/auth';
export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    if (
      request.headers.get('origin') !==
      new URL(process.env.APP_URL || 'http://localhost:3000').origin
    )
      return new Response('Origin denied.', { status: 403 });
    const user = await currentUser();
    if (!user) return new Response('Sign in first.', { status: 401 });
    const { workspaceId } = await context.params;
    if (!z.uuid().safeParse(workspaceId).success)
      return new Response('Workspace not found.', { status: 404 });
    const membership = await db.query.memberships.findFirst({
      where: and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, user.id)),
    });
    if (!membership) return new Response('Workspace not found.', { status: 404 });
    const hash = tokenHash((await cookies()).get('flowstate_session')!.value);
    await db
      .insert(workspacePresence)
      .values({ workspaceId, sessionHash: hash, lastSeenAt: new Date() })
      .onConflictDoUpdate({
        target: [workspacePresence.workspaceId, workspacePresence.sessionHash],
        set: { lastSeenAt: new Date() },
      });
    await db
      .delete(workspacePresence)
      .where(
        and(
          eq(workspacePresence.workspaceId, workspaceId),
          lt(workspacePresence.lastSeenAt, new Date(Date.now() - 24 * 3600_000)),
        ),
      );
    const people = await db
      .selectDistinctOn([users.id], { id: users.id, name: users.name })
      .from(workspacePresence)
      .innerJoin(sessions, eq(sessions.tokenHash, workspacePresence.sessionHash))
      .innerJoin(users, eq(users.id, sessions.userId))
      .innerJoin(
        memberships,
        and(eq(memberships.userId, users.id), eq(memberships.workspaceId, workspaceId)),
      )
      .where(
        and(
          eq(workspacePresence.workspaceId, workspaceId),
          gt(workspacePresence.lastSeenAt, new Date(Date.now() - 35_000)),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(100);
    const [revision] = await db
      .select({ value: sql<string>`count(*)::text` })
      .from(activityEvents)
      .where(eq(activityEvents.workspaceId, workspaceId));
    return Response.json(
      { people, revision: revision.value },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return Response.json(
      { error: 'Workspace presence is temporarily unavailable.' },
      { status: 503 },
    );
  }
}

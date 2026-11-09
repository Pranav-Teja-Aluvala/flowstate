import 'server-only';
import { randomBytes, createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq, gt } from 'drizzle-orm';
import { db, sessions, users, memberships } from '@flowstate/database';
import { canManage, canWrite } from '@flowstate/contracts';

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  await db.insert(sessions).values({ userId, tokenHash: tokenHash(token), expiresAt: expires });
  (await cookies()).set('flowstate_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false',
    sameSite: 'lax',
    path: '/',
    expires,
  });
}
export async function currentUser() {
  const token = (await cookies()).get('flowstate_session')?.value;
  if (!token) return null;
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash(token)), gt(sessions.expiresAt, new Date())));
  return row ?? null;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}
export async function requireMembership(
  workspaceId: string,
  permission: 'read' | 'write' | 'manage' | 'owner' = 'read',
) {
  const user = await requireUser();
  const member = await db.query.memberships.findFirst({
    where: and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, user.id)),
  });
  if (
    !member ||
    (permission === 'write' && !canWrite(member.role)) ||
    (permission === 'manage' && !canManage(member.role)) ||
    (permission === 'owner' && member.role !== 'owner')
  )
    throw new Error('You do not have permission for this action.');
  return { user, member };
}

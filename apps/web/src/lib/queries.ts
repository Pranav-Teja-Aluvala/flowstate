import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db, workspaces, memberships } from '@flowstate/database';
export async function userWorkspaces(userId: string) {
  return db
    .select({ id: workspaces.id, name: workspaces.name, role: memberships.role })
    .from(workspaces)
    .innerJoin(memberships, eq(memberships.workspaceId, workspaces.id))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(workspaces.createdAt));
}

import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db, memberships, projects, projectFiles } from '@flowstate/database';
import { z } from 'zod';
export async function fileAccess(fileId: string, userId: string) {
  if (!z.uuid().safeParse(fileId).success) return undefined;
  const [result] = await db
    .select({ file: projectFiles, role: memberships.role, workspaceId: projects.workspaceId })
    .from(projectFiles)
    .innerJoin(projects, eq(projectFiles.projectId, projects.id))
    .innerJoin(
      memberships,
      and(eq(memberships.workspaceId, projects.workspaceId), eq(memberships.userId, userId)),
    )
    .where(eq(projectFiles.id, fileId));
  return result;
}

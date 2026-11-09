import { createHmac } from 'node:crypto';
import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, documents, projects, memberships } from '@flowstate/database';
import { currentUser, tokenHash } from '@/lib/auth';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const user = await currentUser();
  if (!user || !z.uuid().safeParse(documentId).success)
    return Response.json({ error: 'Access denied' }, { status: 403 });
  const [document] = await db
    .select({ id: documents.id })
    .from(documents)
    .innerJoin(projects, eq(projects.id, documents.projectId))
    .innerJoin(memberships, eq(memberships.workspaceId, projects.workspaceId))
    .where(and(eq(documents.id, documentId), eq(memberships.userId, user.id)));
  if (!document) return Response.json({ error: 'Access denied' }, { status: 403 });
  const secret = process.env.COLLABORATION_SECRET;
  if (!secret || secret.length < 32)
    return Response.json({ error: 'Collaboration is not configured' }, { status: 503 });
  const session = (await cookies()).get('flowstate_session')!.value;
  const payload = Buffer.from(
    JSON.stringify({ documentId, sessionHash: tokenHash(session), expiresAt: Date.now() + 60_000 }),
  ).toString('base64url');
  return Response.json(
    { token: `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}` },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

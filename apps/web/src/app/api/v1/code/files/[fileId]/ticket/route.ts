import { createHmac } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { authorizeCode } from '@flowstate/github';
import { tokenHash } from '@/lib/auth';
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const token = (await cookies()).get('flowstate_session')?.value;
  if (!token || !z.uuid().safeParse(fileId).success)
    return Response.json({ error: 'Access denied' }, { status: 403 });
  try {
    await authorizeCode(fileId, tokenHash(token));
  } catch {
    return Response.json({ error: 'Project and GitHub access are required.' }, { status: 403 });
  }
  const secret = process.env.COLLABORATION_SECRET;
  if (!secret || secret.length < 32)
    return Response.json({ error: 'Collaboration is not configured.' }, { status: 503 });
  const payload = Buffer.from(
    JSON.stringify({
      documentId: `code:${fileId}`,
      sessionHash: tokenHash(token),
      expiresAt: Date.now() + 60_000,
    }),
  ).toString('base64url');
  return Response.json(
    { token: `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}` },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

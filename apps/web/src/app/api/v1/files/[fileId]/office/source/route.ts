import { and, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { db, sessions } from '@flowstate/database';
import { fileAccess } from '@/lib/file-access';
import { verifyOfficeToken } from '@/lib/office-policy';
import { getFile } from '@/lib/file-storage';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await context.params;
    const payload = verifyOfficeToken(new URL(request.url).searchParams.get('ticket') || '');
    const ticket = z
      .object({
        kind: z.literal('office-source'),
        fileId: z.uuid(),
        key: z.uuid(),
        sessionHash: z.string().regex(/^[a-f0-9]{64}$/),
        exp: z.number(),
      })
      .parse(payload);
    if (ticket.fileId !== fileId) throw new Error();
    const session = await db.query.sessions.findFirst({
      where: and(eq(sessions.tokenHash, ticket.sessionHash), gt(sessions.expiresAt, new Date())),
    });
    if (!session) throw new Error();
    const access = await fileAccess(fileId, session.userId);
    if (!access || access.file.officeKey !== ticket.key) throw new Error();
    const bytes = await getFile(access.file.storageProvider, access.file.storageKey);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': access.file.mimeType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('File access denied.', { status: 403 });
  }
}

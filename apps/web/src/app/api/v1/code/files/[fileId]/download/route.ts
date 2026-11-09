import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import * as Y from 'yjs';
import { db, codeFiles, codeStates } from '@flowstate/database';
import { authorizeCode } from '@flowstate/github';
import { repositoryCodeText } from '@flowstate/contracts';
import { currentUser, tokenHash } from '@/lib/auth';
export const runtime = 'nodejs';
export async function GET(_request: Request, context: { params: Promise<{ fileId: string }> }) {
  if (!(await currentUser())) return new Response('Sign in first.', { status: 401 });
  const { fileId } = await context.params;
  if (!z.uuid().safeParse(fileId).success) return new Response('File not found.', { status: 404 });
  try {
    const token = (await cookies()).get('flowstate_session')!.value;
    await authorizeCode(fileId, tokenHash(token));
    const file = await db.query.codeFiles.findFirst({ where: eq(codeFiles.id, fileId) });
    if (!file) throw new Error();
    const state = await db.query.codeStates.findFirst({ where: eq(codeStates.fileId, fileId) });
    const document = new Y.Doc();
    let content = file.initialContent;
    try {
      if (state) {
        Y.applyUpdate(document, state.yjsState);
        content = document.getText('code').toString();
      }
    } finally {
      document.destroy();
    }
    const name = file.path.split('/').pop() || 'source.txt';
    return new Response(repositoryCodeText(content, file.initialContent), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="source.txt"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'",
      },
    });
  } catch {
    return new Response('File access denied.', { status: 403 });
  }
}

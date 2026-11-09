import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, memberships, projects, projectFiles } from '@flowstate/database';
import { currentUser } from '@/lib/auth';
import { getFile } from '@/lib/file-storage';
export const runtime = 'nodejs';
export async function GET(_request: Request, context: { params: Promise<{ fileId: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  const fileId = (await context.params).fileId;
  if (!z.uuid().safeParse(fileId).success) return new Response('File not found.', { status: 404 });
  const [row] = await db
    .select({ file: projectFiles })
    .from(projectFiles)
    .innerJoin(projects, eq(projectFiles.projectId, projects.id))
    .innerJoin(
      memberships,
      and(eq(memberships.workspaceId, projects.workspaceId), eq(memberships.userId, user.id)),
    )
    .where(eq(projectFiles.id, fileId));
  if (!row) return new Response('File not found.', { status: 404 });
  try {
    const body = await getFile(row.file.storageProvider, row.file.storageKey);
    if (body.length !== row.file.size) throw new Error('File size mismatch.');
    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': row.file.mimeType,
        'Content-Length': String(body.length),
        'Content-Disposition': `attachment; filename="download.${row.file.name.split('.').pop()}"; filename*=UTF-8''${encodeURIComponent(row.file.name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16)}`)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'",
      },
    });
  } catch {
    return Response.json({ error: 'The stored file is temporarily unavailable.' }, { status: 503 });
  }
}

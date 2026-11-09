import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, documents, documentStates, projects, memberships } from '@flowstate/database';
import { currentUser } from '@/lib/auth';
import { exportNativeDocument, nativeMime } from '@/lib/native-export';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ documentId: string }> }) {
  const user = await currentUser();
  if (!user) return new Response('Sign in first.', { status: 401 });
  const { documentId } = await context.params;
  if (!z.uuid().safeParse(documentId).success)
    return new Response('Document not found.', { status: 404 });
  const [access] = await db
    .select({ document: documents })
    .from(documents)
    .innerJoin(projects, eq(documents.projectId, projects.id))
    .innerJoin(
      memberships,
      and(eq(memberships.workspaceId, projects.workspaceId), eq(memberships.userId, user.id)),
    )
    .where(eq(documents.id, documentId));
  if (!access) return new Response('Document not found.', { status: 404 });
  const format = new URL(request.url).searchParams.get('format') || '';
  if (!['docx', 'xlsx', 'pptx'].includes(format))
    return new Response('Unsupported export format.', { status: 400 });
  try {
    const state = await db.query.documentStates.findFirst({
      where: eq(documentStates.documentId, documentId),
    });
    const bytes = await exportNativeDocument(
      access.document.kind,
      access.document.title,
      state?.yjsState || null,
      format,
    );
    if (bytes.length > 8 * 1024 * 1024)
      return new Response('This export exceeds the 8 MiB limit.', { status: 413 });
    const name = access.document.title + '.' + format;
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': nativeMime[format],
        'Content-Disposition': `attachment; filename="document.${format}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return Response.json(
      { error: 'Unable to export this document in the selected format.' },
      { status: 400 },
    );
  }
}

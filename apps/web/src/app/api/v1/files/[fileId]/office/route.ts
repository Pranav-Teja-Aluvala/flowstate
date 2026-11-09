import { cookies } from 'next/headers';
import { z } from 'zod';
import { canWrite } from '@flowstate/contracts';
import { currentUser, tokenHash } from '@/lib/auth';
import { fileAccess } from '@/lib/file-access';
import { FileProblem } from '@/lib/file-policy';
import { officeSettings, officeDocumentType, signOfficeToken } from '@/lib/office-policy';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ fileId: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  const { fileId } = await context.params;
  if (!z.uuid().safeParse(fileId).success) return new Response('File not found.', { status: 404 });
  const access = await fileAccess(fileId, user.id);
  if (!access) return new Response('File not found.', { status: 404 });
  if (new URL(request.url).searchParams.get('check') === '1')
    return Response.json(
      { editable: canWrite(access.role), version: access.file.version },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  try {
    const settings = officeSettings();
    const { extension, documentType } = officeDocumentType(access.file.name);
    const token = (await cookies()).get('flowstate_session')!.value;
    const now = Math.floor(Date.now() / 1000);
    const readTicket = signOfficeToken({
      kind: 'office-source',
      fileId,
      key: access.file.officeKey,
      sessionHash: tokenHash(token),
      exp: now + 600,
    });
    const editable = canWrite(access.role);
    const config = {
      documentType,
      document: {
        fileType: extension,
        key: access.file.officeKey,
        title: access.file.name,
        url: `${settings.appOrigin}/api/v1/files/${fileId}/office/source?ticket=${encodeURIComponent(readTicket)}`,
        permissions: {
          edit: editable,
          comment: editable,
          review: editable,
          fillForms: editable,
          download: true,
          print: true,
        },
      },
      editorConfig: {
        mode: editable ? 'edit' : 'view',
        callbackUrl: `${settings.appOrigin}/api/v1/files/${fileId}/office/callback`,
        user: { id: user.id, name: user.name },
        customization: { forcesave: false },
      },
      width: '100%',
      height: '100%',
      type: 'desktop',
    };
    return Response.json(
      {
        serverURL: settings.browserOrigin,
        config: { ...config, token: signOfficeToken({ ...config, exp: now + 300 }) },
        version: access.file.version,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof FileProblem
            ? error.message
            : 'Office editing is not configured on this instance.',
      },
      { status: error instanceof FileProblem ? error.status : 503 },
    );
  }
}

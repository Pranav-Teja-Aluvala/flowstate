import { cookies } from 'next/headers';
import { currentUser, tokenHash } from '@/lib/auth';
import { fileAccess } from '@/lib/file-access';
import { FileProblem } from '@/lib/file-policy';
import { getFile } from '@/lib/file-storage';
import {
  officeSettings,
  officeDocumentType,
  signOfficeToken,
  downloadOfficeResult,
  readOfficeJSON,
} from '@/lib/office-policy';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ fileId: string }> }) {
  const origin = new URL(process.env.APP_URL || 'http://localhost:3000').origin;
  if (request.headers.get('origin') !== origin)
    return new Response('Origin denied.', { status: 403 });
  const user = await currentUser();
  if (!user) return new Response('Sign in first.', { status: 401 });
  const { fileId } = await context.params;
  const access = await fileAccess(fileId, user.id);
  if (!access) return new Response('File not found.', { status: 404 });
  try {
    const { file } = access;
    const { extension } = officeDocumentType(file.name);
    let bytes: Buffer;
    if (extension === 'pdf') bytes = await getFile(file.storageProvider, file.storageKey);
    else {
      const settings = officeSettings();
      const session = (await cookies()).get('flowstate_session')!.value;
      const now = Math.floor(Date.now() / 1000);
      const ticket = signOfficeToken({
        kind: 'office-source',
        fileId,
        key: file.officeKey,
        sessionHash: tokenHash(session),
        exp: now + 120,
      });
      const conversion = {
        async: false,
        filetype: extension,
        outputtype: 'pdf',
        key: `${file.officeKey}-pdf`,
        title: file.name,
        url: `${settings.appOrigin}/api/v1/files/${fileId}/office/source?ticket=${encodeURIComponent(ticket)}`,
      };
      const response = await fetch(`${settings.internalOrigin}/converter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          ...conversion,
          token: signOfficeToken({ ...conversion, exp: now + 120 }),
        }),
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok)
        throw new FileProblem('PDF conversion is unavailable. Check the office service.', 503);
      const result = await readOfficeJSON(
        new Request('http://localhost/result', {
          method: 'POST',
          body: response.body,
          duplex: 'half',
        } as RequestInit),
      );
      if (result.error || result.endConvert !== true || typeof result.fileUrl !== 'string')
        throw new FileProblem(
          'PDF conversion is not ready. Try again after saving and closing all editors.',
          503,
        );
      bytes = await downloadOfficeResult(result.fileUrl);
    }
    if (bytes.subarray(0, 5).toString() !== '%PDF-')
      throw new FileProblem('The office service returned an invalid PDF.', 503);
    // Membership may have changed during the external conversion.
    if (!(await fileAccess(fileId, user.id)))
      return new Response('File access ended.', { status: 403 });
    const name = file.name.replace(/\.[^.]+$/, '') + '.pdf';
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="export.pdf"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof FileProblem
            ? error.message
            : 'PDF export is temporarily unavailable. Your saved file has not changed.',
      },
      { status: error instanceof FileProblem ? error.status : 503 },
    );
  }
}

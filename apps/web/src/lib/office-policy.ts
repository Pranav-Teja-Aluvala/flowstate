import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { FileProblem, MAX_FILE_BYTES } from './file-policy';

export function officeSecret() {
  const secret = process.env.OFFICE_JWT_SECRET || '';
  if (secret.length < 32)
    throw new FileProblem('Office editing is not configured on this instance.', 503);
  return secret;
}
function serviceOrigin(value: string | undefined) {
  const url = new URL(value || '');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new FileProblem('Office service URL is not configured correctly.', 503);
  if (
    url.protocol === 'http:' &&
    !['localhost', '127.0.0.1', 'office', 'web', 'host.docker.internal'].includes(url.hostname)
  )
    throw new FileProblem('Use HTTPS for a public office service.', 503);
  return url.origin;
}
export function officeSettings() {
  officeSecret();
  const browserOrigin = serviceOrigin(process.env.OFFICE_PUBLIC_URL);
  if (
    new URL(browserOrigin).hostname ===
    new URL(process.env.APP_URL || 'http://localhost:3000').hostname
  )
    throw new FileProblem(
      'Use a separate hostname for the office service so application cookies are not sent to it.',
      503,
    );
  return {
    browserOrigin,
    internalOrigin: serviceOrigin(process.env.OFFICE_INTERNAL_URL || process.env.OFFICE_PUBLIC_URL),
    appOrigin: serviceOrigin(
      process.env.OFFICE_APP_URL || process.env.APP_URL || 'http://localhost:3000',
    ),
  };
}
export function signOfficeToken(payload: Record<string, unknown>, secret = officeSecret()) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signed = `${header}.${body}`;
  return `${signed}.${createHmac('sha256', secret).update(signed).digest('base64url')}`;
}
export function verifyOfficeToken(token: string, secret = officeSecret()) {
  if (token.length > 24_000) throw new FileProblem('Office authorization denied.', 401);
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error();
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (header.alg !== 'HS256') throw new Error();
    const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
    const supplied = Buffer.from(parts[2], 'base64url');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied))
      throw new Error();
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error();
    if (
      payload.exp !== undefined &&
      (typeof payload.exp !== 'number' || payload.exp <= Date.now() / 1000)
    )
      throw new Error();
    if (
      payload.nbf !== undefined &&
      (typeof payload.nbf !== 'number' || payload.nbf > Date.now() / 1000)
    )
      throw new Error();
    return payload;
  } catch {
    throw new FileProblem('Office authorization denied.', 401);
  }
}
const callbackSchema = z.object({
  key: z.uuid(),
  status: z.number().int(),
  url: z.string().max(4000).optional(),
  filetype: z.string().max(12).optional(),
  users: z.array(z.uuid()).max(100).optional(),
});
export function officeCallback(token: string) {
  const signed = verifyOfficeToken(token);
  if (signed.operation !== undefined && signed.operation !== 'callback')
    throw new FileProblem('Wrong office token purpose.', 401);
  // Outgoing callbacks use payload; browser configuration tokens do not.
  return callbackSchema.parse(signed.payload);
}
export function officeDownloadURL(value: string) {
  const settings = officeSettings();
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.hash ||
    ![settings.browserOrigin, settings.internalOrigin].includes(url.origin) ||
    !url.pathname.startsWith('/cache/files/')
  )
    throw new FileProblem('Office save URL denied.', 403);
  // The URL may contain a document-server cache token. Never log it.
  return `${settings.internalOrigin}${url.pathname}${url.search}`;
}
export function officeDocumentType(name: string) {
  const extension = name.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = { docx: 'word', xlsx: 'cell', pptx: 'slide', pdf: 'pdf' };
  if (!extension || !types[extension])
    throw new FileProblem('Open a PDF, DOCX, XLSX or PPTX file in the office editor.');
  return { extension, documentType: types[extension] };
}
export async function readOfficeJSON(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new FileProblem('Office request body missing.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 24_000) {
      await reader.cancel();
      throw new FileProblem('Office request too large.', 413);
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function downloadOfficeResult(url: string) {
  const response = await fetch(officeDownloadURL(url), {
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  });
  if (!response.ok || !response.body)
    throw new FileProblem('The office server could not return the saved file.', 503);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_FILE_BYTES) {
      await reader.cancel();
      throw new FileProblem('The edited file exceeds the 4 MiB limit.', 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

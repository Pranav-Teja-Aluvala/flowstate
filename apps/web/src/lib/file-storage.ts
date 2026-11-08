import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MAX_FILE_BYTES, FileProblem } from './file-policy';

export type StorageProvider = 'local' | 'supabase';
function validKey(key: string) {
  if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}$/.test(key)) throw new Error('Invalid storage key.');
}
export function storageProvider(): StorageProvider {
  const value = process.env.FILE_STORAGE_PROVIDER || 'local';
  if (value !== 'local' && value !== 'supabase')
    throw new FileProblem('File storage is not configured.', 503);
  if (process.env.VERCEL && value === 'local')
    throw new FileProblem('Configure durable file storage for this hosted instance.', 503);
  return value;
}
function localPath(key: string) {
  validKey(key);
  return resolve(
    process.env.FILE_STORAGE_PATH || resolve(process.cwd(), '../../.local/files'),
    key,
  );
}
function remote(key: string) {
  validKey(key);
  const url = new URL(process.env.SUPABASE_URL || '');
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/')
    throw new Error('Invalid storage URL.');
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'flowstate-files';
  if (!/^[a-z0-9-]+$/.test(bucket)) throw new Error('Invalid storage bucket.');
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Storage credential missing.');
  return {
    url: `${url.origin}/storage/v1/object/${bucket}/${key}`,
    headers: { apikey: secret, Authorization: `Bearer ${secret}` },
  };
}
export async function putFile(provider: StorageProvider, key: string, body: Buffer, mime: string) {
  if (provider === 'local') {
    const filename = localPath(key);
    await mkdir(resolve(filename, '..'), { recursive: true, mode: 0o700 });
    await writeFile(filename, body, { flag: 'wx', mode: 0o600 });
    return;
  }
  const { url, headers } = remote(key);
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': mime, 'x-upsert': 'false' },
    body: new Uint8Array(body),
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error('Storage upload failed.');
}
export async function getFile(provider: string, key: string) {
  // Runtime uploads are external data, never files to bundle into a deployment.
  if (provider === 'local') return readFile(/*turbopackIgnore: true*/ localPath(key));
  if (provider !== 'supabase') throw new Error('Unknown storage provider.');
  const { url, headers } = remote(key);
  const response = await fetch(url, {
    headers,
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error('Storage download failed.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Storage returned an empty response.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_FILE_BYTES) {
      await reader.cancel();
      throw new Error('Stored object exceeds file limit.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function discardUncommittedFile(provider: StorageProvider, key: string) {
  if (provider === 'local') {
    await unlink(localPath(key));
    return;
  }
  const { url, headers } = remote(key);
  const response = await fetch(url, {
    method: 'DELETE',
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Storage cleanup failed.');
}

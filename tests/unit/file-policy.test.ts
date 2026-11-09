import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  fileMetadata,
  validateFile,
  readUpload,
  MAX_FILE_BYTES,
} from '../../apps/web/src/lib/file-policy';
import { putFile, getFile, storageProvider } from '../../apps/web/src/lib/file-storage';
describe('project file boundaries', () => {
  it('rejects unsafe names and executable or macro-enabled uploads', () => {
    for (const name of [
      '../brief.pdf',
      'folder\\brief.docx',
      'run.exe',
      'macro.docm',
      'bad\nname.txt',
      ' file.txt',
    ])
      expect(() => fileMetadata(name)).toThrow();
    expect(fileMetadata('Résumé.PDF').mimeType).toBe('application/pdf');
  });
  it('checks size, file signatures and UTF-8 text rather than trusting browser MIME types', () => {
    expect(() => validateFile('brief.pdf', Buffer.from('not a pdf'))).toThrow('PDF signature');
    expect(() => validateFile('brief.docx', Buffer.from('not a zip'))).toThrow(
      'Office ZIP signature',
    );
    expect(() => validateFile('brief.txt', Buffer.from([0xff]))).toThrow('UTF-8');
    expect(() => validateFile('brief.txt', Buffer.from([0]))).toThrow('binary');
    expect(() => validateFile('brief.txt', Buffer.alloc(MAX_FILE_BYTES + 1))).toThrow('4 MiB');
    expect(validateFile('brief.pdf', Buffer.from('%PDF-1.4\nfixture')).extension).toBe('pdf');
  });
  it('enforces upload limits even without a content-length header', async () => {
    const request = new Request('http://localhost/upload', {
      method: 'POST',
      body: new Uint8Array(MAX_FILE_BYTES + 1),
    });
    await expect(readUpload(request)).rejects.toThrow('4 MiB');
  });
  it('keeps local file keys isolated and refuses overwrite', async () => {
    const previous = process.env.FILE_STORAGE_PATH;
    const directory = await mkdtemp(join(tmpdir(), 'flowstate-files-'));
    process.env.FILE_STORAGE_PATH = directory;
    try {
      const key = `${randomUUID()}/${randomUUID()}`;
      const body = Buffer.from('Team brief');
      await putFile('local', key, body, 'text/plain');
      expect(await getFile('local', key)).toEqual(body);
      expect(await readFile(join(directory, key))).toEqual(body);
      await expect(putFile('local', key, Buffer.from('overwrite'), 'text/plain')).rejects.toThrow();
      await expect(getFile('local', '../outside')).rejects.toThrow('Invalid storage key');
    } finally {
      if (previous === undefined) delete process.env.FILE_STORAGE_PATH;
      else process.env.FILE_STORAGE_PATH = previous;
    }
  });
  it('refuses ephemeral local storage on Vercel', () => {
    const previous = process.env.VERCEL;
    const provider = process.env.FILE_STORAGE_PROVIDER;
    process.env.VERCEL = '1';
    process.env.FILE_STORAGE_PROVIDER = 'local';
    try {
      expect(() => storageProvider()).toThrow('durable');
    } finally {
      if (previous === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previous;
      if (provider === undefined) delete process.env.FILE_STORAGE_PROVIDER;
      else process.env.FILE_STORAGE_PROVIDER = provider;
    }
  });
  it('keeps Supabase credentials in server requests and rejects failed or redirected storage responses', async () => {
    const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
    process.env.SUPABASE_URL = 'https://fixture.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-server-only-secret';
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    try {
      const key = `${randomUUID()}/${randomUUID()}`;
      await putFile('supabase', key, Buffer.from('brief'), 'text/plain');
      const [url, options] = fetcher.mock.calls[0];
      expect(url).toBe(`https://fixture.supabase.co/storage/v1/object/flowstate-files/${key}`);
      expect(url).not.toContain('fixture-server-only-secret');
      expect(options.headers.Authorization).toBe('Bearer fixture-server-only-secret');
      expect(options.redirect).toBe('error');
      expect(options.headers['x-upsert']).toBe('false');
      fetcher.mockResolvedValueOnce(new Response(null, { status: 403 }));
      await expect(putFile('supabase', key, Buffer.from('brief'), 'text/plain')).rejects.toThrow(
        'Storage upload failed',
      );
      fetcher.mockResolvedValueOnce(new Response('stored brief'));
      expect(await getFile('supabase', key)).toEqual(Buffer.from('stored brief'));
    } finally {
      vi.unstubAllGlobals();
      if (previous.url === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = previous.url;
      if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
    }
  });
});

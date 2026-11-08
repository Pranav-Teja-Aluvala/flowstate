import { createHash } from 'node:crypto';
import { extract } from 'tar-stream';
import type { Readable } from 'node:stream';
import { safeCodePath } from '@flowstate/github';
import { RunnerError } from './policy';
export type RuntimeChange = { path: string; baselineHash: string; content: string };
export const contentHash = (value: Uint8Array | string) =>
  createHash('sha256').update(value).digest('hex');
export async function collectRuntimeChanges(archive: Readable, baseline: Map<string, string>) {
  const changes: RuntimeChange[] = [];
  let entries = 0,
    total = 0,
    changedBytes = 0;
  await new Promise<void>((resolve, reject) => {
    const parser = extract();
    const fail = (error: Error) => {
      archive.destroy();
      parser.destroy(error);
    };
    archive.on('error', reject);
    parser.on('error', reject);
    parser.on('finish', resolve);
    parser.on('entry', (header, entry, next) => {
      entry.on('error', reject);
      if (++entries > 2000) {
        fail(new RunnerError('Runtime archive exceeds the review limit.'));
        return;
      }
      const path = header.name.replace(/^workspace\//, '');
      if (path !== '.git' && !path.startsWith('.git/')) total += header.size || 0;
      if (total > 32 * 1024 * 1024) {
        fail(new RunnerError('Runtime archive exceeds the review limit.'));
        return;
      }
      if (
        header.type === 'directory' ||
        path === '.git' ||
        path.startsWith('.git/') ||
        !baseline.has(path)
      ) {
        entry.resume();
        entry.on('end', next);
        return;
      }
      try {
        safeCodePath(path);
      } catch {
        fail(new RunnerError('Unsafe runtime file path.'));
        return;
      }
      if (header.type !== 'file' || (header.size || 0) > 256 * 1024) {
        fail(new RunnerError('Only regular UTF-8 files up to 256 KiB can be imported.'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      entry.on('data', (chunk: unknown) => {
        if (!Buffer.isBuffer(chunk)) {
          fail(new RunnerError('Unsupported runtime archive data.'));
          return;
        }
        size += chunk.length;
        if (size > 256 * 1024) fail(new RunnerError('Runtime file exceeds the review limit.'));
        else chunks.push(chunk);
      });
      entry.on('end', () => {
        try {
          const bytes = Buffer.concat(chunks);
          if (contentHash(bytes) !== baseline.get(path)) {
            const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            if (content.includes('\0')) throw new Error();
            changedBytes += bytes.length;
            if (changes.length >= 20 || changedBytes > 512 * 1024)
              throw new RunnerError('Review at most 20 changed files and 512 KiB at a time.');
            changes.push({ path, baselineHash: baseline.get(path)!, content });
          }
          next();
        } catch (error) {
          fail(
            error instanceof RunnerError
              ? error
              : new RunnerError('Binary runtime changes cannot be imported.'),
          );
        }
      });
    });
    archive.pipe(parser);
  });
  return changes;
}

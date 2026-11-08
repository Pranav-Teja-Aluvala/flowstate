import { describe, expect, it } from 'vitest';
import { pack } from 'tar-stream';
import { Readable } from 'node:stream';
import { collectRuntimeChanges, contentHash } from '../../apps/runner/src/changes';
function archive(entries: { name: string; content?: string; type?: 'file' | 'symlink' }[]) {
  const stream = pack();
  for (const entry of entries)
    stream.entry(
      {
        name: entry.name,
        type: entry.type || 'file',
        linkname: entry.type === 'symlink' ? '/etc/passwd' : undefined,
      },
      entry.type === 'symlink' ? undefined : Buffer.from(entry.content || ''),
    );
  stream.finalize();
  return Readable.from(stream);
}
describe('runtime review boundaries', () => {
  it('reviews only tracked changed text and leaves git metadata and generated files out', async () => {
    const baseline = new Map([
      ['src/main.ts', contentHash('original')],
      ['unchanged.txt', contentHash('same')],
    ]);
    const result = await collectRuntimeChanges(
      archive([
        { name: 'workspace/src/main.ts', content: 'edited' },
        { name: 'workspace/unchanged.txt', content: 'same' },
        { name: 'workspace/.git/config', content: 'metadata' },
        { name: 'workspace/generated.txt', content: 'untracked' },
      ]),
      baseline,
    );
    expect(result).toEqual([
      { path: 'src/main.ts', baselineHash: contentHash('original'), content: 'edited' },
    ]);
  });
  it('rejects symlinks, unsafe paths and oversized tracked content', async () => {
    await expect(
      collectRuntimeChanges(
        archive([{ name: 'workspace/known.txt', type: 'symlink' }]),
        new Map([['known.txt', contentHash('before')]]),
      ),
    ).rejects.toThrow('regular UTF-8');
    await expect(
      collectRuntimeChanges(
        archive([{ name: 'workspace/../escape', content: 'edited' }]),
        new Map([['../escape', contentHash('before')]]),
      ),
    ).rejects.toThrow('Unsafe');
    await expect(
      collectRuntimeChanges(
        archive([{ name: 'workspace/known.txt', content: 'x'.repeat(256 * 1024 + 1) }]),
        new Map([['known.txt', contentHash('before')]]),
      ),
    ).rejects.toThrow('256 KiB');
  });
  it('bounds the number of files in one review', async () => {
    const entries = Array.from({ length: 21 }, (_, index) => ({
      name: `workspace/file-${index}.txt`,
      content: 'edited',
    }));
    const baseline = new Map(entries.map((entry) => [entry.name.slice(10), contentHash('before')]));
    await expect(collectRuntimeChanges(archive(entries), baseline)).rejects.toThrow(
      '20 changed files',
    );
  });
});

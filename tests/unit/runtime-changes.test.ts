import { describe, expect, it } from 'vitest';
import { pack } from 'tar-stream';
import { Readable } from 'node:stream';
import { collectRuntimeChanges, contentHash } from '../../apps/runner/src/changes';
import { repositoryCodeText } from '../../packages/contracts';
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
  it('matches Windows text baselines with shared LF buffers and preserves repository CRLF on publishing', async () => {
    const baseline = new Map([['main.ts', contentHash('first\r\nsecond\r\n')]]);
    expect(
      await collectRuntimeChanges(
        archive([{ name: './main.ts', content: 'first\nsecond\n' }]),
        baseline,
      ),
    ).toEqual([]);
    const changed = await collectRuntimeChanges(
      archive([{ name: './main.ts', content: 'first\r\nchanged\r\n' }]),
      baseline,
    );
    expect(changed[0].baselineHash).toBe(contentHash('first\nsecond\n'));
    expect(repositoryCodeText('first\nchanged\n', 'first\r\nsecond\r\n')).toBe(
      'first\r\nchanged\r\n',
    );
  });
  it('reviews only tracked changed text and leaves git metadata and generated files out', async () => {
    const baseline = new Map([
      ['src/main.ts', contentHash('original')],
      ['unchanged.txt', contentHash('same')],
    ]);
    const result = await collectRuntimeChanges(
      archive([
        { name: './src/main.ts', content: 'edited' },
        { name: './unchanged.txt', content: 'same' },
        { name: './.git/config', content: 'metadata' },
        { name: './generated.txt', content: 'untracked' },
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
        archive([{ name: './known.txt', type: 'symlink' }]),
        new Map([['known.txt', contentHash('before')]]),
      ),
    ).rejects.toThrow('regular UTF-8');
    await expect(
      collectRuntimeChanges(
        archive([{ name: './../escape', content: 'edited' }]),
        new Map([['../escape', contentHash('before')]]),
      ),
    ).rejects.toThrow('Unsafe');
    await expect(
      collectRuntimeChanges(
        archive([{ name: './known.txt', content: 'x'.repeat(256 * 1024 + 1) }]),
        new Map([['known.txt', contentHash('before')]]),
      ),
    ).rejects.toThrow('256 KiB');
  });
  it('bounds the number of files in one review', async () => {
    const entries = Array.from({ length: 21 }, (_, index) => ({
      name: `./file-${index}.txt`,
      content: 'edited',
    }));
    const baseline = new Map(entries.map((entry) => [entry.name.slice(2), contentHash('before')]));
    await expect(collectRuntimeChanges(archive(entries), baseline)).rejects.toThrow(
      '20 changed files',
    );
  });
  it('preserves repository directories named workspace', async () => {
    const changes = await collectRuntimeChanges(
      archive([{ name: './workspace/config.txt', content: 'updated' }]),
      new Map([['workspace/config.txt', contentHash('original')]]),
    );
    expect(changes[0].path).toBe('workspace/config.txt');
  });
});

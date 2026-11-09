import type Docker from 'dockerode';
import { pack } from 'tar-stream';
import type { SnapshotFile } from './snapshot';
import { RunnerError } from './policy';
import { safeCodePath } from '@flowstate/github';
import { PassThrough } from 'node:stream';
export async function runtimeArchive(container: Docker.Container) {
  const command = await container.exec({
    Cmd: ['tar', '-c', '-C', '/workspace', '.'],
    User: '1000:1000',
    WorkingDir: '/workspace',
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });
  const stream = await command.start({ hijack: true, stdin: false, Tty: false });
  const output = new PassThrough();
  const errors = new PassThrough();
  errors.on('data', () => {});
  container.modem.demuxStream(stream, output, errors);
  const timer = setTimeout(() => {
    stream.destroy();
    output.destroy(new RunnerError('Runtime review timed out.'));
  }, 20_000);
  stream.on('error', (error) => {
    clearTimeout(timer);
    output.destroy(error);
  });
  stream.on('end', () => {
    clearTimeout(timer);
    void command
      .inspect()
      .then((info) => {
        if (info.ExitCode !== 0)
          output.destroy(
            new RunnerError(
              'The terminal files changed during review. Retry after the command finishes.',
            ),
          );
        else output.end();
      })
      .catch((error) => output.destroy(error));
  });
  output.on('close', () => {
    clearTimeout(timer);
    stream.destroy();
  });
  return output;
}
export async function putFiles(container: Docker.Container, files: SnapshotFile[]) {
  // Docker's archive PUT rejects read-only root filesystems, even for writable tmpfs paths.
  // Extract through an unprivileged exec into /workspace instead; keep rootfs protection intact.
  const command = await container.exec({
    Cmd: ['tar', '-x', '-m', '--no-same-owner', '-C', '/workspace'],
    User: '1000:1000',
    WorkingDir: '/workspace',
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });
  const stream = await command.start({ hijack: true, stdin: true, Tty: false });
  const archive = pack();
  const completion = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      stream.destroy();
      reject(new RunnerError('Workspace file transfer timed out.'));
    }, 20_000);
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    stream.on('data', () => {});
    stream.on('end', () => finish());
    stream.on('error', finish);
    archive.on('error', finish);
  });
  archive.pipe(stream);
  for (const file of files)
    archive.entry(
      {
        name: safeCodePath(file.path),
        size: file.content.length,
        mode: file.mode,
        uid: 1000,
        gid: 1000,
        type: 'file',
      },
      file.content,
    );
  archive.finalize();
  await completion;
  if ((await command.inspect()).ExitCode !== 0)
    throw new RunnerError('Unable to copy source into the isolated workspace.');
}

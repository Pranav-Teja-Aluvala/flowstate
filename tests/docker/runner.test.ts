import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import Docker from 'dockerode';
import { pack } from 'tar-stream';
import { containerConfiguration } from '../../apps/runner/src/policy';
const docker = new Docker({
  socketPath:
    process.env.DOCKER_SOCKET_PATH ||
    (process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock'),
});
let container: Docker.Container;
async function run(command: string[]) {
  const exec = await container.exec({
    Cmd: command,
    User: '1000:1000',
    WorkingDir: '/workspace',
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
  });
  const stream = await exec.start({ hijack: true, stdin: false });
  let result = '';
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk) => {
      result += chunk.toString();
    });
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return result;
}
beforeAll(async () => {
  await docker.ping();
  container = await docker.createContainer(
    containerConfiguration(
      `flowstate-test-${randomUUID()}`,
      process.env.RUNNER_IMAGE || 'flowstate-runner:local',
    ),
  );
  await container.start();
});
afterAll(async () => {
  if (container) await container.remove({ force: true }).catch(() => {});
});
it('executes a source snapshot as non-root and retains writable workspace files', async () => {
  const archive = pack();
  const source =
    'require("node:fs").writeFileSync("/workspace/result.txt","sandbox-ok");console.log(process.getuid())';
  archive.entry({ name: 'program.cjs', uid: 1000, gid: 1000, mode: 0o644 }, source);
  archive.finalize();
  await container.putArchive(Readable.from(archive), { path: '/workspace' });
  expect(await run(['node', 'program.cjs'])).toContain('1000');
  expect(
    await run(['node', '-e', 'console.log(require("node:fs").readFileSync("result.txt","utf8"))']),
  ).toContain('sandbox-ok');
});
it('enforces network, root-filesystem and Docker-socket isolation', async () => {
  const info = await container.inspect();
  expect(info.HostConfig.NetworkMode).toBe('none');
  expect(info.HostConfig.ReadonlyRootfs).toBe(true);
  expect(info.HostConfig.Memory).toBe(512 * 1024 * 1024);
  expect(info.Mounts.some((m) => m.Type === 'bind')).toBe(false);
  expect(
    await run([
      'node',
      '-e',
      'const fs=require("node:fs");console.log(fs.existsSync("/var/run/docker.sock"));try{fs.writeFileSync("/etc/flowstate-test","x");console.log("WRITABLE")}catch{console.log("BLOCKED")}',
    ]),
  ).toContain('false\r\nBLOCKED');
  expect(
    await run([
      'node',
      '-e',
      'fetch("http://1.1.1.1",{signal:AbortSignal.timeout(1000)}).then(()=>console.log("UNEXPECTED"),()=>console.log("NETWORK_BLOCKED"))',
    ]),
  ).toContain('NETWORK_BLOCKED');
});

import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import Docker from 'dockerode';
import { putFiles } from '../../apps/runner/src/files';
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
    Tty: false,
  });
  const stream = await exec.start({ hijack: true, stdin: false, Tty: false });
  const output = new PassThrough();
  docker.modem.demuxStream(stream, output, output);
  let result = '';
  await new Promise<void>((resolve, reject) => {
    output.on('data', (chunk) => {
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
  const source =
    'require("node:fs").writeFileSync("/workspace/result.txt","sandbox-ok");console.log(process.getuid())';
  await putFiles(container, [{ path: 'program.cjs', content: Buffer.from(source), mode: 0o644 }]);
  expect(await run(['node', 'program.cjs'])).toContain('1000');
  expect(
    await run(['node', '-e', 'console.log(require("node:fs").readFileSync("result.txt","utf8"))']),
  ).toContain('sandbox-ok');
});
it('queues CLI publishing for explicit browser review without exposing GitHub credentials', async () => {
  expect(await run(['flowstate', 'push', 'Update the team prototype'])).toContain(
    'Nothing has been pushed yet.',
  );
  const request = JSON.parse((await run(['cat', '/tmp/flowstate-publish.json'])).trim());
  expect(request.title).toBe('Update the team prototype');
  expect(request.id).toMatch(/^[a-f0-9-]{36}$/);
  expect(
    await run([
      'node',
      '-e',
      'console.log(Object.keys(process.env).filter(key=>/GITHUB|TOKEN|SECRET/.test(key)).join(","))',
    ]),
  ).not.toMatch(/GITHUB|TOKEN|SECRET/);
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
  ).toMatch(/false\r?\nBLOCKED/);
  expect(
    await run([
      'node',
      '-e',
      'fetch("http://1.1.1.1",{signal:AbortSignal.timeout(1000)}).then(()=>console.log("UNEXPECTED"),()=>console.log("NETWORK_BLOCKED"))',
    ]),
  ).toContain('NETWORK_BLOCKED');
});

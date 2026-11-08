import 'dotenv/config';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import Docker from 'dockerode';
import { WebSocketServer, WebSocket } from 'ws';
import { Readable, PassThrough } from 'node:stream';
import { z } from 'zod';
import { authorizeCodeSession, GitHubError } from '@flowstate/github';
import { db, activityEvents, projects, pool } from '@flowstate/database';
import { eq } from 'drizzle-orm';
import { verifyRunnerTicket, containerConfiguration, RunnerError } from './policy';
import { repositorySnapshot } from './snapshot';
import { putFiles } from './files';
import { collectRuntimeChanges, contentHash } from './changes';
const secret = process.env.COLLABORATION_SECRET || '';
if (secret.length < 32)
  throw new RunnerError('Configure COLLABORATION_SECRET before starting the runner.');
const image = process.env.RUNNER_IMAGE || 'flowstate-runner:local';
const docker = new Docker({
  socketPath:
    process.env.DOCKER_SOCKET_PATH ||
    (process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock'),
});
const origins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim());
type Access = Awaited<ReturnType<typeof authorizeCodeSession>>;
type Environment = {
  container: Docker.Container;
  exec: Docker.Exec;
  stream: NodeJS.ReadWriteStream;
  clients: Map<WebSocket, Access>;
  output: string;
  created: number;
  lastUsed: number;
  syncing: boolean;
  baseline: Map<string, string>;
  checkingControl: boolean;
  lastPublishRequest: string;
};
const environments = new Map<string, Promise<Environment>>();
const send = (ws: WebSocket, message: unknown) => {
  if (ws.bufferedAmount > 2 * 1024 * 1024) {
    ws.close(1009, 'Terminal output exceeded client capacity');
    return;
  }
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
};
async function containerCommand(
  container: Docker.Container,
  command: string[],
  allowFailure = false,
) {
  const exec = await container.exec({
    Cmd: command,
    User: '1000:1000',
    WorkingDir: '/workspace',
    AttachStdout: true,
    AttachStderr: false,
    Tty: false,
  });
  const stream = await exec.start({ hijack: true, stdin: false, Tty: false });
  const outputStream = new PassThrough();
  docker.modem.demuxStream(stream, outputStream, new PassThrough());
  let output = '';
  await new Promise<void>((resolve, reject) => {
    outputStream.on('data', (bytes: Buffer) => {
      if (output.length + bytes.length > 8192) {
        stream.destroy();
        reject(new RunnerError('Runner command response exceeded its limit.'));
        return;
      }
      output += bytes.toString('utf8');
    });
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  if ((await exec.inspect()).ExitCode !== 0 && !allowFailure)
    throw new RunnerError('Unable to prepare the local Git workspace.');
  return output;
}
async function createEnvironment(access: Access): Promise<Environment> {
  const files = await repositorySnapshot(access.userId, access.sessionId);
  const container = await docker.createContainer(
    containerConfiguration(`flowstate-${randomUUID()}`, image),
  );
  try {
    await container.start();
    await putFiles(container, files);
    for (const command of [
      ['git', 'init', '--quiet', '--initial-branch=flowstate-local'],
      ['git', 'config', 'user.name', 'FLOWSTATE workspace'],
      ['git', 'config', 'user.email', 'workspace@flowstate.local'],
      ['git', 'add', '--all'],
      ['git', 'commit', '--quiet', '--allow-empty', '-m', 'Start shared workspace'],
    ])
      await containerCommand(container, command);
    const exec = await container.exec({
      Cmd: ['/bin/sh'],
      User: '1000:1000',
      WorkingDir: '/workspace',
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Env: ['TERM=xterm-256color', 'HOME=/tmp'],
    });
    const stream = await exec.start({ hijack: true, stdin: true, Tty: true });
    const environment: Environment = {
      container,
      exec,
      stream,
      clients: new Map(),
      output: '',
      created: Date.now(),
      lastUsed: Date.now(),
      syncing: false,
      baseline: new Map(files.map((file) => [file.path, contentHash(file.content)])),
      checkingControl: false,
      lastPublishRequest: '',
    };
    stream.on('data', (bytes: Buffer) => {
      const data = bytes.toString('utf8');
      environment.output = (environment.output + data).slice(-64 * 1024);
      for (const client of environment.clients.keys()) send(client, { type: 'output', data });
    });
    stream.on('end', () => {
      for (const client of environment.clients.keys()) client.close(1000, 'Terminal exited');
      void removeEnvironment(access.sessionId);
    });
    stream.on('error', () => {
      for (const client of environment.clients.keys()) client.close(1011, 'Terminal stream ended');
      void removeEnvironment(access.sessionId);
    });
    const project = await db.query.projects.findFirst({ where: eq(projects.id, access.projectId) });
    if (project)
      await db.insert(activityEvents).values({
        workspaceId: project.workspaceId,
        actorId: access.userId,
        action: 'runtime.started',
        objectType: 'code_session',
        objectId: access.sessionId,
      });
    return environment;
  } catch {
    await container.remove({ force: true }).catch(() => {});
    throw new RunnerError(
      'Unable to create the isolated Docker workspace. Check Docker and the runner image.',
    );
  }
}
async function removeEnvironment(id: string) {
  const pending = environments.get(id);
  if (!pending) return;
  environments.delete(id);
  const env = await pending.catch(() => null);
  if (!env) return;
  for (const client of env.clients.keys()) client.close(1000, 'Workspace stopped');
  (env.stream as import('node:stream').Duplex).destroy();
  await env.container.remove({ force: true }).catch(() => {});
}
const http = createServer(async (request, response) => {
  if (request.url !== '/health') {
    response.writeHead(404).end();
    return;
  }
  try {
    await docker.ping();
    await docker.getImage(image).inspect();
    response
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ ready: true }));
  } catch {
    response
      .writeHead(503, { 'Content-Type': 'application/json' })
      .end(
        JSON.stringify({ ready: false, message: 'Start Docker and build flowstate-runner:local.' }),
      );
  }
});
const wsServer = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
http.on('upgrade', (request, socket, head) => {
  if (!request.headers.origin || !origins.includes(request.headers.origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  wsServer.handleUpgrade(request, socket, head, (ws) => wsServer.emit('connection', ws, request));
});
wsServer.on('connection', (ws) => {
  let access: Access | undefined;
  let env: Environment | undefined;
  let queued = 0;
  let chain = Promise.resolve();
  const authTimeout = setTimeout(() => ws.close(4401, 'Authentication required'), 5000);
  ws.on('error', () => {});
  ws.on('message', (bytes) => {
    if (++queued > 128) {
      ws.close(1009, 'Too many pending messages');
      return;
    }
    chain = chain.then(async () => {
      try {
        const message = z
          .object({
            type: z.string(),
            token: z.string().optional(),
            data: z.string().max(4096).optional(),
            cols: z.number().int().min(10).max(300).optional(),
            rows: z.number().int().min(5).max(100).optional(),
          })
          .parse(JSON.parse(bytes.toString()));
        if (!access) {
          if (message.type !== 'authenticate' || !message.token)
            throw new RunnerError('Access denied');
          const ticket = verifyRunnerTicket(message.token, secret);
          access = await authorizeCodeSession(ticket.sessionId, ticket.sessionHash);
          clearTimeout(authTimeout);
          let pending = environments.get(access.sessionId);
          if (!pending) {
            if (access.role === 'viewer')
              throw new RunnerError('An editor must start the terminal before viewers can watch.');
            if (environments.size >= 4)
              throw new RunnerError('Runner capacity reached. Stop an existing workspace.');
            pending = createEnvironment(access);
            environments.set(access.sessionId, pending);
            pending.catch(() => environments.delete(access!.sessionId));
          }
          env = await pending;
          if (ws.readyState !== WebSocket.OPEN) {
            env.lastUsed = Date.now();
            return;
          }
          access = await authorizeCodeSession(access.sessionId, access.sessionHash);
          env.clients.set(ws, access);
          env.lastUsed = Date.now();
          send(ws, { type: 'output', data: env.output });
          send(ws, { type: 'ready' });
          return;
        }
        access = await authorizeCodeSession(access.sessionId, access.sessionHash);
        if (!env) throw new RunnerError('Terminal unavailable');
        env.lastUsed = Date.now();
        if (message.type === 'resize' && access.role !== 'viewer' && message.cols && message.rows)
          await env.exec.resize({ w: message.cols, h: message.rows });
        else if (message.type === 'input' && access.role !== 'viewer' && message.data)
          env.stream.write(message.data);
        else if (message.type === 'review' && access.role !== 'viewer' && !env.syncing) {
          env.syncing = true;
          try {
            const changes = await collectRuntimeChanges(
              (await env.container.getArchive({ path: '/workspace' })) as Readable,
              env.baseline,
            );
            send(ws, { type: 'changes', changes });
          } finally {
            env.syncing = false;
          }
        } else if (message.type === 'sync' && access.role !== 'viewer' && !env.syncing) {
          env.syncing = true;
          try {
            const files = await repositorySnapshot(access.userId, access.sessionId);
            const current = new Map(files.map((file) => [file.path, contentHash(file.content)]));
            const changes = await collectRuntimeChanges(
              (await env.container.getArchive({ path: '/workspace' })) as Readable,
              env.baseline,
            );
            if (changes.some((change) => contentHash(change.content) !== current.get(change.path)))
              throw new RunnerError(
                'The terminal has unsaved edits. Review and import them before syncing shared files.',
              );
            await putFiles(env.container, files);
            env.baseline = current;
            for (const client of env.clients.keys())
              send(client, {
                type: 'output',
                data: '\r\n[FLOWSTATE: saved files synchronized]\r\n',
              });
          } finally {
            env.syncing = false;
          }
        } else if (message.type === 'stop' && access.role !== 'viewer')
          await removeEnvironment(access.sessionId);
      } catch (cause) {
        send(ws, {
          type: cause instanceof RunnerError && access && env ? 'operation-error' : 'error',
          message:
            cause instanceof RunnerError || cause instanceof GitHubError
              ? cause.message
              : 'Terminal operation failed.',
        });
        if (!(cause instanceof RunnerError && access && env)) ws.close(4403, 'Operation denied');
      } finally {
        queued--;
      }
    });
  });
  ws.on('close', () => {
    clearTimeout(authTimeout);
    env?.clients.delete(ws);
    if (env) env.lastUsed = Date.now();
  });
});
const timer = setInterval(() => {
  for (const [id, pending] of environments)
    void pending
      .then(async (env) => {
        if (
          Date.now() - env.created > 30 * 60_000 ||
          (!env.clients.size && Date.now() - env.lastUsed > 60_000)
        ) {
          await removeEnvironment(id);
          return;
        }
        for (const [client, access] of env.clients)
          try {
            const updated = await authorizeCodeSession(id, access.sessionHash);
            if (updated.role !== access.role) client.close(4403, 'Permissions changed');
          } catch {
            client.close(4403, 'Access revoked');
          }
        if (
          !env.checkingControl &&
          [...env.clients.values()].some((access) => access.role !== 'viewer')
        ) {
          env.checkingControl = true;
          try {
            const value = await containerCommand(
              env.container,
              ['cat', '/tmp/flowstate-publish.json'],
              true,
            );
            if (value) {
              const request = z
                .object({ id: z.uuid(), title: z.string().trim().min(1).max(150) })
                .parse(JSON.parse(value));
              if (request.id !== env.lastPublishRequest) {
                env.lastPublishRequest = request.id;
                for (const [client, access] of env.clients)
                  if (access.role !== 'viewer')
                    send(client, { type: 'publish-review', ...request });
              }
            }
          } catch {
            /* An absent or invalid request never triggers a publish. */
          } finally {
            env.checkingControl = false;
          }
        }
      })
      .catch(() => {});
}, 2000);
timer.unref();
http.listen(Number(process.env.RUNNER_PORT || 1236), '127.0.0.1', () =>
  console.log('FLOWSTATE local Docker runner listening.'),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, async () => {
    clearInterval(timer);
    for (const id of environments.keys()) await removeEnvironment(id);
    wsServer.close();
    http.close();
    await pool.end();
    process.exit(0);
  });

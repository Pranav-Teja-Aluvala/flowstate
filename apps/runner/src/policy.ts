import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
export class RunnerError extends Error {}
export function verifyRunnerTicket(token: string, secret: string) {
  const [payload, signature] = token.split('.');
  if (!payload || !signature || token.length > 2048 || secret.length < 32)
    throw new Error('Access denied');
  const expected = createHmac('sha256', secret).update(payload).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(expected, received))
    throw new Error('Access denied');
  const data = z
    .object({
      kind: z.literal('terminal'),
      sessionId: z.uuid(),
      sessionHash: z.string().regex(/^[a-f0-9]{64}$/),
      expiresAt: z.number(),
    })
    .parse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
  if (data.expiresAt < Date.now() || data.expiresAt > Date.now() + 120_000)
    throw new Error('Access denied');
  return data;
}
export function containerConfiguration(name: string, image: string) {
  return {
    name,
    Image: image,
    User: '1000:1000',
    WorkingDir: '/workspace',
    Cmd: ['node', '-e', 'setTimeout(()=>process.exit(0), 1800000)'],
    Env: ['HOME=/tmp', 'TERM=xterm-256color'],
    NetworkDisabled: true,
    Labels: { 'flowstate.runner': 'true' },
    HostConfig: {
      NetworkMode: 'none',
      ReadonlyRootfs: true,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges:true'],
      Memory: 512 * 1024 * 1024,
      MemorySwap: 512 * 1024 * 1024,
      NanoCpus: 1_000_000_000,
      PidsLimit: 128,
      Tmpfs: {
        '/workspace': 'rw,nosuid,nodev,uid=1000,gid=1000,size=134217728',
        '/tmp': 'rw,nosuid,nodev,uid=1000,gid=1000,size=67108864',
      },
      AutoRemove: true,
    },
  };
}

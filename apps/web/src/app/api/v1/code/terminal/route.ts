import { createHmac } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { authorizeCodeSession } from '@flowstate/github';
import { tokenHash, currentUser } from '@/lib/auth';
export async function POST(request: Request) {
  if (
    request.headers.get('origin') !== new URL(process.env.APP_URL || 'http://localhost:3000').origin
  )
    return Response.json({ error: 'Origin denied.' }, { status: 403 });
  const sessionToken = (await cookies()).get('flowstate_session')?.value;
  if (!sessionToken || !(await currentUser()))
    return Response.json({ error: 'Sign in first.' }, { status: 401 });
  try {
    if (process.env.RUNNER_ENABLED !== 'true')
      return Response.json(
        { error: 'Code execution is disabled on this instance.' },
        { status: 503 },
      );
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: 'A code session is required.' }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return Response.json({ error: 'Request too large.' }, { status: 413 });
      }
      chunks.push(value);
    }
    const { sessionId } = z
      .object({ sessionId: z.uuid() })
      .parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    await authorizeCodeSession(sessionId, tokenHash(sessionToken));
    const secret = process.env.COLLABORATION_SECRET;
    if (!secret || secret.length < 32) throw new Error('Runner is not configured.');
    const response = await fetch(
      `${process.env.RUNNER_INTERNAL_URL || 'http://127.0.0.1:1236'}/health`,
      { signal: AbortSignal.timeout(3000), cache: 'no-store' },
    );
    if (!response.ok)
      return Response.json(
        {
          error:
            'Docker runner is not ready. Start Docker, build the runner image, and run npm run dev:runner.',
        },
        { status: 503 },
      );
    const payload = Buffer.from(
      JSON.stringify({
        kind: 'terminal',
        sessionId,
        sessionHash: tokenHash(sessionToken),
        expiresAt: Date.now() + 60_000,
      }),
    ).toString('base64url');
    return Response.json(
      { token: `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}` },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { error: 'Terminal unavailable. Check Docker runner setup and your project/GitHub access.' },
      { status: 503 },
    );
  }
}

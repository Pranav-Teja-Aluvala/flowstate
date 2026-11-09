'use server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { importRuntimeBuffers } from '@flowstate/github/runtime';
import { GitHubError } from '@flowstate/github';
import { currentUser, tokenHash } from './auth';
export async function importRuntimeChanges(sessionId: string, changes: unknown) {
  try {
    if (!(await currentUser())) return { error: 'Sign in first.' };
    z.uuid().parse(sessionId);
    const token = (await cookies()).get('flowstate_session')?.value;
    if (!token) return { error: 'Sign in first.' };
    const count = await importRuntimeBuffers({
      sessionId,
      sessionHash: tokenHash(token),
      changes,
      secret: process.env.COLLABORATION_SECRET || '',
      origin: new URL(process.env.APP_URL || 'http://localhost:3000').origin,
      collaborationURL: process.env.COLLABORATION_INTERNAL_URL || 'ws://127.0.0.1:1234',
    });
    return {
      success: `${count} runtime file(s) saved to shared code. Review them before publishing.`,
    };
  } catch (error) {
    return {
      error:
        error instanceof GitHubError
          ? error.message
          : 'Import interrupted. Reopen the shared editor to check saved changes before retrying.',
    };
  }
}

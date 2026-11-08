import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, projects, githubOAuthStates } from '@flowstate/database';
import { githubConfigured } from '@flowstate/github';
import { requireMembership, tokenHash } from '@/lib/auth';
export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get('projectId');
  if (!z.uuid().safeParse(projectId).success)
    return Response.json({ error: 'Invalid project.' }, { status: 400 });
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId!) });
  if (!project) return Response.json({ error: 'Project not found.' }, { status: 404 });
  const { user } = await requireMembership(project.workspaceId);
  if (!githubConfigured())
    return Response.json(
      { error: 'GitHub App setup is required. See docs/github-setup.md.' },
      { status: 503 },
    );
  const state = randomBytes(32).toString('base64url');
  await db.insert(githubOAuthStates).values({
    tokenHash: tokenHash(state),
    userId: user.id,
    projectId: project.id,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID!);
  url.searchParams.set('state', state);
  url.searchParams.set(
    'redirect_uri',
    `${process.env.APP_URL || 'http://localhost:3000'}/api/github/callback`,
  );
  return NextResponse.redirect(url);
}

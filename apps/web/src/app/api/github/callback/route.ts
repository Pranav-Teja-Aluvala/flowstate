import { and, eq, gt } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db, githubAccounts, githubOAuthStates, projects, memberships } from '@flowstate/database';
import { githubFetch, exchangeOAuth, encryptToken } from '@flowstate/github';
import { requireUser, tokenHash } from '@/lib/auth';
export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!state || state.length > 100 || !code || code.length > 500)
    return Response.json(
      { error: 'GitHub authorization was cancelled or is invalid.' },
      { status: 400 },
    );
  const [pending] = await db
    .delete(githubOAuthStates)
    .where(
      and(
        eq(githubOAuthStates.tokenHash, tokenHash(state)),
        eq(githubOAuthStates.userId, user.id),
        gt(githubOAuthStates.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!pending)
    return Response.json(
      { error: 'Authorization expired or was already used. Start again from your project.' },
      { status: 400 },
    );
  const project = await db.query.projects.findFirst({ where: eq(projects.id, pending.projectId) });
  if (
    !project ||
    !(await db.query.memberships.findFirst({
      where: and(eq(memberships.workspaceId, project.workspaceId), eq(memberships.userId, user.id)),
    }))
  )
    return Response.json({ error: 'Project access denied.' }, { status: 403 });
  const destination = `${process.env.APP_URL || 'http://localhost:3000'}/w/${project.workspaceId}/p/${project.id}/code`;
  try {
    const tokens = await exchangeOAuth({
      code,
      redirect_uri: `${process.env.APP_URL || 'http://localhost:3000'}/api/github/callback`,
    });
    const remote = await githubFetch<{ id: number; login: string }>(tokens.access_token, '/user');
    const data = {
      githubId: String(remote.id),
      login: remote.login,
      accessToken: encryptToken(tokens.access_token),
      refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
      expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    };
    await db
      .insert(githubAccounts)
      .values({ ...data, userId: user.id })
      .onConflictDoUpdate({ target: githubAccounts.userId, set: data });
    return NextResponse.redirect(destination);
  } catch {
    return NextResponse.redirect(`${destination}?github=error`);
  }
}

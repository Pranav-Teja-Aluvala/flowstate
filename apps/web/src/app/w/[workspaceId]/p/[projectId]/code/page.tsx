import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { ArrowLeft, GitFork, GitBranch, GitPullRequest } from 'lucide-react';
import {
  db,
  projects,
  githubAccounts,
  repositories,
  codeSessions,
  codeFiles,
} from '@flowstate/database';
import {
  GitHubError,
  githubConfigured,
  githubToken,
  githubFetch,
  repositoryAccess,
  repositoryPath,
  safeCodePath,
  type GitHubRepository,
  type GitHubEntry,
} from '@flowstate/github';
import { canManage, canWrite } from '@flowstate/contracts';
import { requireUser } from '@/lib/auth';
import { userWorkspaces } from '@/lib/queries';
import {
  connectRepository,
  startCodeSession,
  disconnectGitHub,
  publishPullRequest,
} from '@/lib/github-actions';
import { ActionForm, Dialog } from '@/components/forms';
import { Shell } from '@/components/shell';
import { FileBrowser, SharedCodeEditor } from '@/components/code-workspace';
import { SharedTerminal } from '@/components/terminal';

export default async function ProjectCode({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
  searchParams: Promise<{
    session?: string;
    file?: string;
    path?: string;
    installation?: string;
    github?: string;
  }>;
}) {
  const { workspaceId, projectId } = await params;
  const query = await searchParams;
  const user = await requireUser();
  const spaces = await userWorkspaces(user.id);
  const workspace = spaces.find((w) => w.id === workspaceId);
  if (!workspace) notFound();
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) notFound();
  const account = await db.query.githubAccounts.findFirst({
    where: eq(githubAccounts.userId, user.id),
    columns: { login: true },
  });
  const repo = await db.query.repositories.findFirst({
    where: eq(repositories.projectId, projectId),
  });
  const sessions = await db
    .select()
    .from(codeSessions)
    .where(eq(codeSessions.projectId, projectId))
    .orderBy(desc(codeSessions.createdAt));
  const session = sessions.find((s) => s.id === query.session) || sessions[0];
  const base = `/w/${workspaceId}/p/${projectId}`;
  const codeBase = `${base}/code`;
  let error = '';
  let availableRepos: GitHubRepository[] = [];
  let installations: { id: number; account: { login: string } }[] = [];
  let installation: string | undefined;
  let branches: { name: string }[] = [];
  let commits: { sha: string; html_url: string; commit: { message: string } }[] = [];
  let prs: { number: number; title: string; html_url: string }[] = [];
  let entries: GitHubEntry[] = [];
  let push = false;
  if (account)
    try {
      if (!repo) {
        const token = await githubToken(user.id);
        installations = (
          await githubFetch<{ installations: typeof installations }>(
            token,
            '/user/installations?per_page=100',
          )
        ).installations;
        installation =
          installations.find((i) => String(i.id) === query.installation)?.id.toString() ||
          installations[0]?.id.toString();
        if (installation)
          availableRepos = (
            await githubFetch<{ repositories: GitHubRepository[] }>(
              token,
              `/user/installations/${installation}/repositories?per_page=100`,
            )
          ).repositories;
      } else {
        const access = await repositoryAccess(user.id, projectId);
        push = Boolean(access.remote.permissions?.push);
        const path = repositoryPath(repo);
        [branches, commits, prs] = await Promise.all([
          githubFetch<typeof branches>(access.token, `${path}/branches?per_page=100`),
          githubFetch<typeof commits>(access.token, `${path}/commits?per_page=5`),
          githubFetch<typeof prs>(access.token, `${path}/pulls?state=open&per_page=5`),
        ]);
        if (session) {
          const dir = query.path ? safeCodePath(query.path) : '';
          const data = await githubFetch<GitHubEntry[] | GitHubEntry>(
            access.token,
            `${path}/contents/${dir.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(session.baseCommit)}`,
          );
          if (Array.isArray(data)) entries = data;
        }
      }
    } catch (cause) {
      error =
        cause instanceof GitHubError
          ? cause.message
          : 'GitHub is unavailable. Check the app configuration and reconnect your account.';
    }
  const selectedFile = z.uuid().safeParse(query.file);
  const file =
    session && selectedFile.success
      ? await db.query.codeFiles.findFirst({
          where: and(eq(codeFiles.id, selectedFile.data), eq(codeFiles.sessionId, session.id)),
        })
      : null;
  return (
    <Shell user={user} workspaces={spaces} active={workspaceId}>
      <header className="topbar">
        <span>
          {project.name}
          <span className="crumb">/</span>
          <strong>Code & GitHub</strong>
        </span>
        <GitFork size={18} />
      </header>
      <main className="workspace-main code-main">
        <Link className="back-link" href={base}>
          <ArrowLeft size={15} />
          Back to project
        </Link>
        <section className="page-heading">
          <div>
            <p className="eyebrow">BUILD ON THE SAME PAGE</p>
            <h1>Code, together.</h1>
            <p className="muted">
              Your repository, shared editing, and a workspace to run the work.
            </p>
          </div>
          <Link className="button secondary" href={`${base}/settings`}>
            Project settings
          </Link>
        </section>
        {query.github === 'error' && (
          <p className="feedback error" role="alert">
            GitHub authorization failed. Check the app configuration and try again.
          </p>
        )}
        {error && (
          <p className="feedback error" role="alert">
            {error}
          </p>
        )}
        {!account ? (
          <section className="settings-card">
            <GitFork size={27} />
            <h2>Connect your GitHub account</h2>
            <p className="muted">
              GitHub access stays personal. You need repository permission as well as FLOWSTATE
              project membership.
            </p>
            {githubConfigured() ? (
              <a className="button primary" href={`/api/github/start?projectId=${projectId}`}>
                Authorize GitHub
              </a>
            ) : (
              <p className="setup-notice">
                A workspace operator needs to configure the GitHub App first. Setup instructions are
                included in <code>docs/github-setup.md</code>.
              </p>
            )}
          </section>
        ) : (
          <div className="github-identity">
            <GitFork size={16} />
            Connected as {account.login}
            <details>
              <summary>Connection options</summary>
              <ActionForm action={disconnectGitHub} label="Disconnect my GitHub account" />
            </details>
          </div>
        )}
        {account && !repo && (
          <section className="settings-card">
            <h2>Choose a repository</h2>
            <p className="muted">
              Install FLOWSTATE on selected repositories, then link one to this project.
            </p>
            {process.env.GITHUB_APP_SLUG && (
              <a
                className="back-link"
                target="_blank"
                rel="noreferrer"
                href={`https://github.com/apps/${encodeURIComponent(process.env.GITHUB_APP_SLUG)}/installations/new`}
              >
                Install or manage selected repositories ↗
              </a>
            )}
            <nav className="board-tabs">
              {installations.map((i) => (
                <Link
                  key={i.id}
                  href={`${codeBase}?installation=${i.id}`}
                  className={String(i.id) === installation ? 'selected' : ''}
                >
                  {i.account.login}
                </Link>
              ))}
            </nav>
            {canManage(workspace.role) && installation && availableRepos.length > 0 ? (
              <ActionForm action={connectRepository} label="Connect repository">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="installationId" value={installation} />
                <label>
                  Repository
                  <select name="repositoryId">
                    {availableRepos
                      .filter((r) => r.permissions?.push)
                      .map((r) => (
                        <option value={r.id} key={r.id}>
                          {r.full_name}
                          {r.private ? ' · private' : ''}
                        </option>
                      ))}
                  </select>
                </label>
              </ActionForm>
            ) : (
              <p className="muted">
                An owner or admin with GitHub write access can link an installed repository.
              </p>
            )}
          </section>
        )}
        {repo && account && !error && (
          <>
            <section className="repo-summary">
              <div>
                <GitFork size={22} />
                <strong>
                  {repo.owner}/{repo.name}
                </strong>
              </div>
              <a
                target="_blank"
                rel="noreferrer"
                href={`https://github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`}
              >
                Open on GitHub ↗
              </a>
            </section>
            <div className="repository-activity">
              <section>
                <h2>
                  <GitBranch size={16} />
                  Recent commits
                </h2>
                {commits.map((c) => (
                  <a key={c.sha} target="_blank" rel="noreferrer" href={c.html_url}>
                    <code>{c.sha.slice(0, 7)}</code>
                    {c.commit.message.split('\n')[0]}
                  </a>
                ))}
              </section>
              <section>
                <h2>
                  <GitPullRequest size={16} />
                  Open pull requests
                </h2>
                {prs.length ? (
                  prs.map((pr) => (
                    <a key={pr.number} href={pr.html_url} target="_blank" rel="noreferrer">
                      #{pr.number} {pr.title}
                    </a>
                  ))
                ) : (
                  <p className="muted">No open pull requests.</p>
                )}
              </section>
            </div>
            <div className="project-controls">
              <nav className="board-tabs">
                {sessions.map((s) => (
                  <Link
                    href={`${codeBase}?session=${s.id}`}
                    key={s.id}
                    className={s.id === session?.id ? 'selected' : ''}
                  >
                    {s.branch} · {s.baseCommit.slice(0, 7)}
                  </Link>
                ))}
              </nav>
              {canWrite(workspace.role) && push && (
                <Dialog title="Start a shared code session" trigger="New code session">
                  <ActionForm action={startCodeSession} label="Start session">
                    <input type="hidden" name="projectId" value={projectId} />
                    <label>
                      Base branch
                      <select name="branch" defaultValue={repo.defaultBranch}>
                        {branches.map((b) => (
                          <option key={b.name}>{b.name}</option>
                        ))}
                      </select>
                    </label>
                  </ActionForm>
                </Dialog>
              )}
            </div>
            {session ? (
              <>
                <div className="coding-layout">
                  <FileBrowser
                    entries={entries.sort(
                      (a, b) =>
                        Number(b.type === 'dir') - Number(a.type === 'dir') ||
                        a.name.localeCompare(b.name),
                    )}
                    projectId={projectId}
                    sessionId={session.id}
                    baseUrl={`${codeBase}?session=${session.id}`}
                    parent={query.path ? query.path.split('/').slice(0, -1).join('/') : null}
                  />
                  {file ? (
                    <SharedCodeEditor
                      key={file.id}
                      fileId={file.id}
                      path={file.path}
                      user={user}
                      editable={canWrite(workspace.role) && push}
                    />
                  ) : (
                    <section className="empty-state">
                      <h3>Pick a file. Bring your team.</h3>
                      <p>
                        Open a text file to edit together. Changes stay in FLOWSTATE until you
                        publish a pull request.
                      </p>
                    </section>
                  )}
                </div>
                <SharedTerminal
                  projectId={projectId}
                  sessionId={session.id}
                  editable={canWrite(workspace.role) && push}
                />
                {canWrite(workspace.role) && push && (
                  <section className="settings-card publish-card">
                    <h2>Review and publish your saved changes</h2>
                    <p className="muted">
                      Creates a new branch and pull request. Your base branch is never overwritten.
                      Wait for all editors to show “Saved to database” before publishing.
                    </p>
                    <ActionForm action={publishPullRequest} label="Create branch & pull request">
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="sessionId" value={session.id} />
                      <label>
                        Pull request title
                        <input name="title" required maxLength={150} />
                      </label>
                    </ActionForm>
                  </section>
                )}
              </>
            ) : (
              <section className="empty-state">
                <h3>Start with a branch.</h3>
                <p>Create a shared code session to browse, edit, and run repository files.</p>
              </section>
            )}
          </>
        )}
      </main>
    </Shell>
  );
}

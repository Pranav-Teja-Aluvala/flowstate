import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { ArrowUpRight, FolderOpen, Users, ArrowRight, LayoutGrid } from 'lucide-react';
import { db, projects, memberships } from '@flowstate/database';
import { canWrite } from '@flowstate/contracts';
import { requireUser } from '@/lib/auth';
import { userWorkspaces } from '@/lib/queries';
import { saveProject } from '@/lib/actions';
import { ActionForm, Dialog } from '@/components/forms';
import { Shell } from '@/components/shell';
export default async function Workspace({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const user = await requireUser();
  const spaces = await userWorkspaces(user.id);
  const workspace = spaces.find((w) => w.id === workspaceId);
  if (!workspace) notFound();
  const [items, members] = await Promise.all([
    db
      .select()
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId))
      .orderBy(asc(projects.createdAt)),
    db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(eq(memberships.workspaceId, workspaceId)),
  ]);
  return (
    <Shell user={user} workspaces={spaces} active={workspaceId}>
      <header className="topbar">
        <span>
          {workspace.name}
          <span className="crumb">/</span>
          <strong>Projects</strong>
        </span>
        <Link className="member-count" href={`/w/${workspaceId}/settings`}>
          <Users size={15} />
          {members.length} {members.length === 1 ? 'member' : 'members'}
        </Link>
      </header>
      <main className="workspace-main">
        <section className="page-heading">
          <div>
            <p className="eyebrow">A PLACE FOR WHAT’S NEXT</p>
            <h1>
              Your projects<span className="heading-dot">.</span>
            </h1>
            <p className="muted">Big ideas. Small steps. All moving forward.</p>
          </div>
          {canWrite(workspace.role) && (
            <Dialog title="Start a new project" trigger="New project">
              <ActionForm action={saveProject} label="Create project">
                <input type="hidden" name="workspaceId" value={workspaceId} />
                <label>
                  Project name
                  <input
                    autoFocus
                    name="name"
                    required
                    maxLength={80}
                    placeholder="What are you working on?"
                  />
                </label>
                <label>
                  Description
                  <textarea
                    name="description"
                    maxLength={1000}
                    placeholder="A little context for your team…"
                  />
                </label>
              </ActionForm>
            </Dialog>
          )}
        </section>
        <section className="workspace-banner">
          <div>
            <span className="eyebrow">{workspace.name.toUpperCase()}</span>
            <h2>
              Make space for
              <br />
              <em>your best work.</em>
            </h2>
            <p>A shared direction starts with a project.</p>
          </div>
          <Link className="banner-action" href={`/w/${workspaceId}/settings`}>
            <span className="banner-action-icon">
              <Users size={28} strokeWidth={1} />
            </span>
            <span>
              {members.length} {members.length === 1 ? 'person' : 'people'}. One shared space.
            </span>
            <strong>
              Meet your workspace
              <ArrowUpRight size={16} />
            </strong>
          </Link>
        </section>
        <div className="section-heading">
          <h2>
            <LayoutGrid size={17} />
            All projects <span>{items.length.toString().padStart(2, '0')}</span>
          </h2>
          <span className="muted small">Your shared starting points</span>
        </div>
        {items.length ? (
          <div className="project-grid">
            {items.map((project, i) => (
              <Link
                href={`/w/${workspaceId}/p/${project.id}`}
                className="project-card"
                key={project.id}
              >
                <div className={`project-icon tone-${i % 3}`}>
                  <FolderOpen size={22} />
                </div>
                <ArrowUpRight className="project-arrow" size={19} />
                <h3>{project.name}</h3>
                <p>{project.description || 'A fresh space for your next idea.'}</p>
                <footer>
                  <span>
                    Created{' '}
                    {project.createdAt.toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      timeZone: 'Asia/Kolkata',
                    })}
                  </span>
                  <ArrowRight size={15} />
                </footer>
              </Link>
            ))}
          </div>
        ) : (
          <section className="empty-state">
            <FolderOpen size={30} strokeWidth={1} />
            <h3>Your next idea belongs here.</h3>
            <p>Create your first project to give the work a home.</p>
          </section>
        )}
        <footer className="page-footer">
          <span>Thoughtful work starts here.</span>
          <span>
            FLOWSTATE <span className="brand-dot" />
          </span>
        </footer>
      </main>
    </Shell>
  );
}

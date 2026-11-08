import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { ArrowUpRight, FolderOpen, Users, ArrowRight, LayoutGrid } from 'lucide-react';
import {
  db,
  projects,
  memberships,
  workspaceNotes,
  users,
  activityEvents,
  tasks,
  columns,
  boards,
} from '@flowstate/database';
import { canWrite } from '@flowstate/contracts';
import { requireUser } from '@/lib/auth';
import { userWorkspaces } from '@/lib/queries';
import { saveProject } from '@/lib/actions';
import { ActionForm, Dialog } from '@/components/forms';
import { Shell } from '@/components/shell';
import { postTeamNote } from '@/lib/work-actions';
export default async function Workspace({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const user = await requireUser();
  const spaces = await userWorkspaces(user.id);
  const workspace = spaces.find((w) => w.id === workspaceId);
  if (!workspace) notFound();
  const [items, members, notes, activity, summary] = await Promise.all([
    db
      .select()
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId))
      .orderBy(asc(projects.createdAt)),
    db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(eq(memberships.workspaceId, workspaceId)),
    db
      .select({
        id: workspaceNotes.id,
        body: workspaceNotes.body,
        author: users.name,
        createdAt: workspaceNotes.createdAt,
      })
      .from(workspaceNotes)
      .innerJoin(users, eq(workspaceNotes.authorId, users.id))
      .where(eq(workspaceNotes.workspaceId, workspaceId))
      .orderBy(desc(workspaceNotes.createdAt))
      .limit(20),
    db
      .select({
        id: activityEvents.id,
        action: activityEvents.action,
        actor: users.name,
        createdAt: activityEvents.createdAt,
      })
      .from(activityEvents)
      .innerJoin(users, eq(activityEvents.actorId, users.id))
      .where(eq(activityEvents.workspaceId, workspaceId))
      .orderBy(desc(activityEvents.createdAt))
      .limit(8),
    db
      .select({
        total: sql<number>`count(*)::int`,
        assigned: sql<number>`count(*) filter (where ${tasks.assigneeId} = ${user.id})::int`,
      })
      .from(tasks)
      .innerJoin(columns, eq(tasks.columnId, columns.id))
      .innerJoin(boards, eq(columns.boardId, boards.id))
      .innerJoin(projects, eq(boards.projectId, projects.id))
      .where(eq(projects.workspaceId, workspaceId)),
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
        <p className="workspace-task-summary" aria-label="Workspace task summary">
          {summary[0].total} tasks · {summary[0].assigned} assigned to you
        </p>
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
        <section className="settings-grid workspace-updates">
          <section className="settings-card">
            <h2>Team notes</h2>
            {canWrite(workspace.role) && (
              <Dialog title="Share a team note" trigger="Share note">
                <ActionForm action={postTeamNote} label="Share note">
                  <input type="hidden" name="workspaceId" value={workspaceId} />
                  <label>
                    Your note
                    <textarea
                      name="body"
                      required
                      maxLength={2000}
                      placeholder="Share context, a decision or a quick update…"
                    />
                  </label>
                </ActionForm>
              </Dialog>
            )}
            {notes.length ? (
              <ol className="team-notes">
                {notes.map((note) => (
                  <li key={note.id}>
                    <p className="note-body">{note.body}</p>
                    <small>
                      {note.author} ·{' '}
                      {note.createdAt.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' })}
                    </small>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">A place for your team’s decisions and updates.</p>
            )}
          </section>
          <section className="settings-card">
            <h2>Recent activity</h2>
            {activity.length ? (
              <ol className="team-notes">
                {activity.map((event) => (
                  <li key={event.id}>
                    <p>
                      {event.actor} · {event.action.replaceAll('.', ' ')}
                    </p>
                    <small>
                      {event.createdAt.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' })}
                    </small>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">Workspace activity will appear here as your team works.</p>
            )}
          </section>
        </section>
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

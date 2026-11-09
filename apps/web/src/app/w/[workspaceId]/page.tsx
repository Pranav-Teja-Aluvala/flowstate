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
import { canWrite, canManage } from '@flowstate/contracts';
import { requireUser } from '@/lib/auth';
import { userWorkspaces } from '@/lib/queries';
import { NewProject } from '@/components/new-project';
import { ActionForm, Dialog } from '@/components/forms';
import { Shell } from '@/components/shell';
import { postTeamNote } from '@/lib/work-actions';
export default async function Workspace({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const user = await requireUser();
  const spaces = await userWorkspaces(user.id);
  const workspace = spaces.find((w) => w.id === workspaceId);
  if (!workspace) notFound();
  const [items, members, notes, activity, summary, assignedTasks] = await Promise.all([
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
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        column: columns.title,
        boardId: boards.id,
        projectId: projects.id,
        project: projects.name,
      })
      .from(tasks)
      .innerJoin(columns, eq(tasks.columnId, columns.id))
      .innerJoin(boards, eq(columns.boardId, boards.id))
      .innerJoin(projects, eq(boards.projectId, projects.id))
      .where(sql`${projects.workspaceId} = ${workspaceId} and ${tasks.assigneeId} = ${user.id}`)
      .orderBy(desc(tasks.updatedAt))
      .limit(5),
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
            <p className="eyebrow">YOUR WORKSPACE</p>
            <h1>
              Your projects<span className="heading-dot">.</span>
            </h1>
            <p className="muted">Projects, shared documents, and the next steps for your team.</p>
          </div>
          <div className="document-actions">
            {canManage(workspace.role) && (
              <Link className="button secondary" href={`/w/${workspaceId}/settings#invite`}>
                Invite teammates
              </Link>
            )}
            {canWrite(workspace.role) && <NewProject workspaceId={workspaceId} />}
          </div>
        </section>
        <div className="workspace-task-summary" aria-label="Workspace overview counts">
          <span>
            <strong>{items.length.toString().padStart(2, '0')}</strong> projects
          </span>
          <span aria-label="Workspace task summary">
            <strong>{summary[0].total}</strong> tasks · {summary[0].assigned} assigned to you
          </span>
          <span className="studio-caption">THE STUDIO / {workspace.role}</span>
        </div>
        <div className="command-layout">
          <section className="workspace-projects" aria-label="Projects">
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
                <p>
                  {canWrite(workspace.role)
                    ? 'Start with a board, then create documents or connect a repository as you need them.'
                    : 'Your team’s projects will appear here. Ask an owner or editor to create the first one.'}
                </p>
                {canWrite(workspace.role) && (
                  <NewProject workspaceId={workspaceId} trigger="Create your first project" />
                )}
              </section>
            )}
          </section>
          <aside className="workspace-updates" aria-label="Team updates">
            <section className="settings-card assigned-work">
              <h2>
                Assigned to you <span className="pill">{summary[0].assigned}</span>
              </h2>
              {assignedTasks.length ? (
                <ul>
                  {assignedTasks.map((task) => (
                    <li key={task.id}>
                      <Link
                        href={`/w/${workspaceId}/p/${task.projectId}?board=${task.boardId}&task=${task.id}#task-${task.id}`}
                      >
                        <strong>{task.title}</strong>
                        <small>
                          {task.project} · {task.column}
                        </small>
                        <ArrowUpRight size={14} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">
                  Nothing assigned to you yet. Assign a task from a project board and it will appear
                  here.
                </p>
              )}
              {summary[0].assigned > 5 && (
                <p className="muted small">Showing your 5 most recently updated tasks.</p>
              )}
            </section>
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
          </aside>
        </div>
        <footer className="page-footer">
          <span>Independent ideas. Collective progress.</span>
          <span>
            FLOWSTATE <span className="brand-dot" />
          </span>
        </footer>
      </main>
    </Shell>
  );
}

import { notFound } from 'next/navigation';
import { asc, desc, eq } from 'drizzle-orm';
import { db, memberships, users, activityEvents } from '@flowstate/database';
import { canManage } from '@flowstate/contracts';
import { requireUser } from '@/lib/auth';
import { userWorkspaces } from '@/lib/queries';
import { saveWorkspace, deleteWorkspace, inviteMember, updateMember } from '@/lib/actions';
import { Shell } from '@/components/shell';
import { ActionForm } from '@/components/forms';
export default async function Settings({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const user = await requireUser();
  const spaces = await userWorkspaces(user.id);
  const workspace = spaces.find((w) => w.id === workspaceId);
  if (!workspace) notFound();
  const members = await db
    .select({ id: users.id, name: users.name, email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.workspaceId, workspaceId))
    .orderBy(asc(memberships.createdAt));
  const events = await db
    .select({
      id: activityEvents.id,
      action: activityEvents.action,
      name: users.name,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .innerJoin(users, eq(users.id, activityEvents.actorId))
    .where(eq(activityEvents.workspaceId, workspaceId))
    .orderBy(desc(activityEvents.createdAt))
    .limit(15);
  const manageable = canManage(workspace.role);
  return (
    <Shell user={user} workspaces={spaces} active={workspaceId}>
      <header className="topbar">
        <span>
          {workspace.name}
          <span className="crumb">/</span>
          <strong>Members & settings</strong>
        </span>
        <span className="pill">{workspace.role}</span>
      </header>
      <main className="workspace-main settings-main">
        <section className="page-heading">
          <div>
            <p className="eyebrow">THE PEOPLE BEHIND THE WORK</p>
            <h1>
              Better, together<span className="heading-dot">.</span>
            </h1>
            <p className="muted">Make room for your people. Keep your workspace in order.</p>
          </div>
        </section>
        <section className="settings-card">
          <h2>
            Workspace members <span className="muted">({members.length})</span>
          </h2>
          <div className="members-list">
            {members.map((person) => (
              <div className="member-row" key={person.id}>
                <span className="avatar">{person.name.slice(0, 1).toUpperCase()}</span>
                <div className="member-info">
                  <strong>{person.name}</strong>
                  <small>{person.email}</small>
                </div>
                {manageable &&
                person.role !== 'owner' &&
                (workspace.role === 'owner' || person.role !== 'admin') ? (
                  <ActionForm action={updateMember} label="Update">
                    <input type="hidden" name="workspaceId" value={workspaceId} />
                    <input type="hidden" name="userId" value={person.id} />
                    <select
                      name="role"
                      defaultValue={person.role}
                      aria-label={`Role for ${person.name}`}
                    >
                      {workspace.role === 'owner' && <option value="admin">Admin</option>}
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                      <option value="remove">Remove member</option>
                    </select>
                  </ActionForm>
                ) : (
                  <span className="pill">{person.role}</span>
                )}
              </div>
            ))}
          </div>
        </section>
        {manageable && (
          <div className="settings-grid">
            <section className="settings-card" id="invite">
              <h2>Invite someone in</h2>
              <p className="muted">
                Create a link for a specific email address. Share it directly with your teammate.
              </p>
              <p className="role-help">
                Editors create and edit work. Viewers read and download. Admins also manage members
                and review code suggestions.
              </p>
              <ActionForm action={inviteMember} label="Create invitation">
                <input type="hidden" name="workspaceId" value={workspaceId} />
                <label>
                  Email address
                  <input name="email" type="email" required placeholder="teammate@yourteam.com" />
                </label>
                <label>
                  Workspace role
                  <select name="role" defaultValue="editor">
                    {workspace.role === 'owner' && <option value="admin">Admin</option>}
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </label>
              </ActionForm>
            </section>
            <section className="settings-card">
              <h2>The workspace details</h2>
              <p className="muted">A name your team can call home.</p>
              <ActionForm action={saveWorkspace}>
                <input type="hidden" name="workspaceId" value={workspaceId} />
                <label>
                  Workspace name
                  <input name="name" defaultValue={workspace.name} required maxLength={80} />
                </label>
              </ActionForm>
            </section>
          </div>
        )}
        <section className="settings-card">
          <h2>Recent activity</h2>
          <div className="activity-list">
            {events.map((event) => (
              <div key={event.id}>
                <span>
                  <strong>{event.name}</strong> ·{' '}
                  {event.action.replaceAll('.', ' ').replaceAll('_', ' ')}
                </span>
                <time>
                  {event.createdAt.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' })} IST
                </time>
              </div>
            ))}
          </div>
        </section>
        {workspace.role === 'owner' && (
          <details className="settings-card danger">
            <summary>Delete workspace</summary>
            <p>
              This permanently deletes the workspace and everything inside it. Enter{' '}
              <strong>{workspace.name}</strong> to confirm.
            </p>
            <ActionForm action={deleteWorkspace} label="Permanently delete workspace">
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <label>
                Workspace name
                <input name="confirmation" required autoComplete="off" />
              </label>
            </ActionForm>
          </details>
        )}
      </main>
    </Shell>
  );
}

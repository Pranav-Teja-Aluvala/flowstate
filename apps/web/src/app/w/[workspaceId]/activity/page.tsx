import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { Activity, ArrowLeft, ArrowRight } from 'lucide-react';
import { db, activityEvents, users } from '@flowstate/database';
import { requireUser } from '@/lib/auth';
import { userWorkspaces } from '@/lib/queries';
import { activityLabel } from '@/lib/activity-label';
import { Shell } from '@/components/shell';
const categories: Record<string, { label: string; actions: string[] }> = {
  all: { label: 'All activity', actions: [] },
  tasks: {
    label: 'Tasks & boards',
    actions: [
      'task.created',
      'task.updated',
      'task.moved',
      'task.deleted',
      'board.created',
      'column.created',
    ],
  },
  documents: {
    label: 'Documents & files',
    actions: [
      'document.created',
      'document.renamed',
      'file.uploaded',
      'file.saved',
      'file.restored',
    ],
  },
  team: {
    label: 'Team & notes',
    actions: [
      'member.invited',
      'member.joined',
      'member.removed',
      'member.role_changed',
      'note.shared',
    ],
  },
  code: {
    label: 'Code & GitHub',
    actions: [
      'repository.connected',
      'code.commented',
      'code.suggested',
      'code.approved',
      'code.rejected',
      'code.applied',
    ],
  },
  projects: { label: 'Projects & workspace', actions: ['workspace.created', 'project.created'] },
};
export default async function WorkspaceActivity({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ category?: string; page?: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireUser();
  const spaces = await userWorkspaces(user.id);
  const workspace = spaces.find((w) => w.id === workspaceId);
  if (!workspace) notFound();
  const query = await searchParams;
  const category = Object.hasOwn(categories, query.category || '') ? query.category! : 'all';
  const page = /^[1-9]\d{0,3}$/.test(query.page || '') ? Number(query.page) : 1;
  const actions = categories[category].actions;
  const results = await db
    .select({
      id: activityEvents.id,
      action: activityEvents.action,
      actor: users.name,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .innerJoin(users, eq(activityEvents.actorId, users.id))
    .where(
      and(
        eq(activityEvents.workspaceId, workspaceId),
        actions.length ? inArray(activityEvents.action, actions) : undefined,
      ),
    )
    .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
    .limit(26)
    .offset((page - 1) * 25);
  const events = results.slice(0, 25);
  const groups = new Map<string, typeof events>();
  for (const event of events) {
    const day = event.createdAt.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
    groups.set(day, [...(groups.get(day) || []), event]);
  }
  const base = `/w/${workspaceId}/activity`;
  const pageURL = (number: number) =>
    `${base}?${new URLSearchParams({ category, page: String(number) })}`;
  return (
    <Shell user={user} workspaces={spaces} active={workspaceId}>
      <header className="topbar">
        <span>
          {workspace.name}
          <span className="crumb">/</span>
          <strong>Activity</strong>
        </span>
        <Activity size={19} />
      </header>
      <main className="workspace-main activity-main">
        <section className="page-heading">
          <div>
            <p className="eyebrow">YOUR TEAM’S TIMELINE</p>
            <h1>Recent activity</h1>
            <p className="muted">See what changed across your workspace, all in one place.</p>
          </div>
        </section>
        <form className="activity-filters" action={base} method="get">
          <label>
            Show activity
            <select key={category} name="category" defaultValue={category}>
              {Object.entries(categories).map(([key, value]) => (
                <option value={key} key={key}>
                  {value.label}
                </option>
              ))}
            </select>
          </label>
          <button className="button primary" type="submit">
            Apply filter
          </button>
          <span>Times shown in IST (UTC+05:30)</span>
        </form>
        {events.length ? (
          <div className="activity-timeline">
            {[...groups].map(([day, items]) => (
              <section key={day} aria-label={day}>
                <h2>{day}</h2>
                <ol>
                  {items.map((event) => (
                    <li key={event.id}>
                      <span className="activity-avatar" aria-hidden="true">
                        {event.actor.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <p>
                          <strong>{event.actor}</strong> {activityLabel(event.action)}
                        </p>
                        <time dateTime={event.createdAt.toISOString()}>
                          {event.createdAt.toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            timeZone: 'Asia/Kolkata',
                          })}{' '}
                          IST
                        </time>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <section className="empty-state">
            <Activity size={30} />
            <h2>No activity to show.</h2>
            <p>
              {page > 1
                ? 'You’ve reached the end of this timeline.'
                : 'Activity will appear here as your team works. Try another filter or head back to your projects.'}
            </p>
            <Link className="button secondary" href={`/w/${workspaceId}`}>
              Go to projects
            </Link>
          </section>
        )}
        <nav className="activity-pagination" aria-label="Activity pages">
          {page > 1 ? (
            <Link className="button secondary" href={pageURL(page - 1)}>
              <ArrowLeft size={16} />
              Newer activity
            </Link>
          ) : (
            <span />
          )}
          <span>Page {page}</span>
          {results.length > 25 ? (
            <Link className="button secondary" href={pageURL(page + 1)}>
              Older activity
              <ArrowRight size={16} />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </main>
    </Shell>
  );
}

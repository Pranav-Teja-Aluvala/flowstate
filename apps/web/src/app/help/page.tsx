import Link from 'next/link';
import { Shell } from '@/components/shell';
import { requireUser } from '@/lib/auth';
import { userWorkspaces } from '@/lib/queries';
export default async function Help({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const user = await requireUser();
  const spaces = await userWorkspaces(user.id);
  const query = await searchParams;
  const workspace = spaces.find((s) => s.id === query.workspace) || spaces[0];
  return (
    <Shell user={user} workspaces={spaces} active={workspace?.id}>
      <header className="topbar">
        <strong>Help & getting started</strong>
        <Link className="back-link" href={workspace ? `/w/${workspace.id}` : '/app'}>
          Back to your workspace →
        </Link>
      </header>
      <main className="workspace-main settings-main help-main">
        <section className="page-heading">
          <div>
            <p className="eyebrow">A CLEAR WAY THROUGH</p>
            <h1>From an idea to shared work.</h1>
            <p className="muted">
              Start with what your team needs today. Documents, code and file uploads are optional
              parts of a project.
            </p>
          </div>
        </section>
        <ol className="help-steps">
          <li>
            <h2>Create a project</h2>
            <p>
              Open Projects and choose New project. Keep the starter board for To do, In progress
              and Done, or begin without a board. Name the work and add a short description.
            </p>
          </li>
          <li>
            <h2>Bring in your team</h2>
            <p>
              Owners and admins can open Members & settings, create an invitation for a teammate’s
              email, and copy the link. Send it directly. The teammate signs in or creates an
              account with that email and returns to the invitation. Links expire after 48 hours.
            </p>
          </li>
          <li>
            <h2>Plan and create together</h2>
            <p>
              Add tasks to a board column, assign a teammate and set a priority. Assigned tasks
              appear on their workspace home. In Documents, choose Word, Excel, PowerPoint or PDF.
              Everyone with edit access can work on the same document; viewers can read and
              download. Open Activity in workspace navigation for the team’s timeline. Filter by
              tasks, documents, team updates or code, and page through older events.
            </p>
          </li>
          <li>
            <h2>Work with code</h2>
            <p>
              In Code & GitHub, connect a repository, start a session from a branch, then open a
              text file. Live edits change your shared copy immediately. To request a review, choose
              Suggest change; an owner or admin can approve, reject and apply it. Comments stay with
              the session.
            </p>
          </li>
          <li>
            <h2>Share the finished work</h2>
            <p>
              Wait for Saved to database. Download Word, Excel or PowerPoint files, or use Export
              PDF / print and choose Save as PDF. Public repository sessions provide saved-file
              downloads. An authorized GitHub connection can publish a new branch and pull request.
            </p>
          </li>
        </ol>
        <section className="settings-card">
          <h2>What each role can do</h2>
          <div className="help-roles">
            <p>
              <strong>Viewer</strong>
              <span>Read projects, documents and code; download saved work.</span>
            </p>
            <p>
              <strong>Editor</strong>
              <span>
                Create and edit work, assign tasks, post notes, comment and propose code changes.
              </span>
            </p>
            <p>
              <strong>Admin</strong>
              <span>
                Manage members, connect repositories and review code suggestions, in addition to
                editing.
              </span>
            </p>
            <p>
              <strong>Owner</strong>
              <span>All admin permissions, plus appointing admins and deleting the workspace.</span>
            </p>
          </div>
        </section>
        <section className="settings-card">
          <h2>If something is unavailable</h2>
          <p>
            New documents and public repository copies work without an Office connection or GitHub
            App. Editing existing uploads while preserving their layout needs the Office service.
            Private GitHub access and publishing need GitHub authorization. Running code needs the
            optional terminal service.
          </p>
          <p>
            Unavailable services are identified in the relevant area. Your workspace operator
            manages these connections. You can continue using the other features.
          </p>
        </section>
        <section className="settings-card">
          <h2>Keep your work safe</h2>
          <p>
            Check the save indicator before leaving an editor or downloading a file. If saving
            fails, keep the tab open and reconnect. Uploaded files keep saved versions: owners and
            admins can restore one from File details after all Office editors close. Native
            documents do not yet have a saved-version rollback history.
          </p>
        </section>
        <p className="muted small">
          <Link href="/privacy">Privacy policy</Link> · <Link href="/terms">Terms of use</Link>
        </p>
      </main>
    </Shell>
  );
}

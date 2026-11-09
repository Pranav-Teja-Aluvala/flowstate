import { redirect } from 'next/navigation';
import { Layers2, ArrowDownRight } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { userWorkspaces } from '@/lib/queries';
import { createWorkspace } from '@/lib/actions';
import { Shell } from '@/components/shell';
import { ActionForm } from '@/components/forms';
export default async function Home({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await requireUser();
  const spaces = await userWorkspaces(user.id);
  if (spaces.length && !(await searchParams).new) redirect(`/w/${spaces[0].id}`);
  return (
    <Shell user={user} workspaces={spaces}>
      <div className="topbar">
        <span>Let’s get you settled</span>
        <span className="pill">Your space to focus</span>
      </div>
      <main className="onboarding">
        <p className="eyebrow">THE START OF SOMETHING GOOD</p>
        <h1>
          Give your team
          <br />a place to <em>flow.</em>
        </h1>
        <p className="muted">
          One shared home for your projects, documents, and the people moving them forward.
        </p>
        <div className="setup-card">
          <div className="setup-icon">
            <Layers2 size={25} />
          </div>
          <h2>Create your workspace</h2>
          <p className="muted">Use your team, studio, or company name.</p>
          <ActionForm action={createWorkspace} label="Create workspace">
            <label>
              Workspace name
              <input
                autoFocus
                name="name"
                placeholder="e.g. Northstar Studio"
                required
                maxLength={80}
              />
            </label>
          </ActionForm>
        </div>
        <span className="onboarding-foot">
          <ArrowDownRight size={16} />
          Every good project starts with a little space.
        </span>
      </main>
    </Shell>
  );
}

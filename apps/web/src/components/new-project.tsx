import { Dialog, ActionForm } from './forms';
import { saveProject } from '@/lib/actions';
export function NewProject({
  workspaceId,
  trigger = 'New project',
}: {
  workspaceId: string;
  trigger?: string;
}) {
  return (
    <Dialog title="Start a new project" trigger={trigger}>
      <p className="muted">Give your team one place for tasks, documents and code.</p>
      <ActionForm action={saveProject} label="Create project">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="openProject" value="1" />
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
          Description <span className="muted small">(optional)</span>
          <textarea
            name="description"
            maxLength={1000}
            placeholder="What does success look like for this project?"
          />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" name="starterBoard" value="1" defaultChecked />
          <span>
            Start with a task board
            <small>To do, In progress and Done. You can add your own columns later.</small>
          </span>
        </label>
      </ActionForm>
    </Dialog>
  );
}

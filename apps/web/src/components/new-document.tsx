import { Dialog, ActionForm } from './forms';
import { DocumentTypes } from './document-types';
import { createDocument } from '@/lib/work-actions';
export function NewDocument({ projectId }: { projectId: string }) {
  return (
    <Dialog title="Create a document" trigger="New document" wide>
      <ActionForm action={createDocument} label="Create document">
        <input type="hidden" name="projectId" value={projectId} />
        <DocumentTypes />
        <label>
          Document title
          <input name="title" required maxLength={80} placeholder="Give your work a name" />
        </label>
      </ActionForm>
    </Dialog>
  );
}

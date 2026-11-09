import { desc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db, codeComments, codeSuggestions, users } from '@flowstate/database';
import { canManage, canWrite, type Role } from '@flowstate/contracts';
import { ActionForm, Dialog } from './forms';
import {
  addCodeComment,
  proposeCodeChange,
  decideCodeSuggestion,
  applyCodeSuggestion,
  codeSnapshot,
} from '@/lib/code-review-actions';
export async function CodeReviewPanel({
  sessionId,
  fileId,
  role,
}: {
  sessionId: string;
  fileId?: string;
  role: Role;
}) {
  const comments = await db
    .select({
      id: codeComments.id,
      body: codeComments.body,
      author: users.name,
      createdAt: codeComments.createdAt,
    })
    .from(codeComments)
    .innerJoin(users, eq(codeComments.authorId, users.id))
    .where(eq(codeComments.sessionId, sessionId))
    .orderBy(desc(codeComments.createdAt))
    .limit(30);
  const suggestions = fileId
    ? await db
        .select({ suggestion: codeSuggestions, author: users.name })
        .from(codeSuggestions)
        .innerJoin(users, eq(codeSuggestions.authorId, users.id))
        .where(eq(codeSuggestions.fileId, fileId))
        .orderBy(desc(codeSuggestions.createdAt))
        .limit(50)
    : [];
  const snapshot = fileId && canWrite(role) ? await codeSnapshot(fileId) : null;
  return (
    <section className="review-studio" aria-label="Code review">
      <div className="section-heading">
        <h2>Discuss. Review. Refine.</h2>
      </div>
      <p className="muted small">
        Suggestions are separate from live edits. Workspace owners and admins review and apply them;
        publishing to GitHub remains a separate step.
      </p>
      <div className="settings-grid">
        <section className="settings-card">
          <h2>Suggested changes</h2>
          {snapshot && (
            <Dialog title="Suggest a code change" trigger="Suggest change">
              <ActionForm action={proposeCodeChange} label="Send for review">
                <input type="hidden" name="fileId" value={fileId} />
                <input
                  type="hidden"
                  name="baselineHash"
                  value={createHash('sha256').update(snapshot.content).digest('hex')}
                />
                <label>
                  Change summary
                  <input name="title" required maxLength={120} />
                </label>
                <label>
                  Suggested code
                  <textarea
                    className="code-suggestion-input"
                    name="content"
                    defaultValue={snapshot.content}
                    maxLength={65536}
                  />
                </label>
              </ActionForm>
            </Dialog>
          )}
          {!fileId && <p className="muted">Open a file to review or suggest changes.</p>}
          {fileId && !suggestions.length && (
            <p className="muted">No suggestions for this file yet.</p>
          )}
          {suggestions.map(({ suggestion: s, author }) => (
            <article className="suggestion" key={s.id}>
              <header>
                <h3>{s.title}</h3>
                <span className="pill">{s.status}</span>
              </header>
              <p className="muted small">
                {author} · {s.createdAt.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' })}
              </p>
              <details>
                <summary>Compare versions</summary>
                <h4>Before</h4>
                <pre>{s.beforeContent || '(empty file)'}</pre>
                <h4>Suggested</h4>
                <pre>{s.proposedContent || '(empty file)'}</pre>
              </details>
              {canManage(role) && s.status === 'pending' && (
                <div className="review-actions">
                  {(['approved', 'rejected'] as const).map((decision) => (
                    <ActionForm
                      key={decision}
                      action={decideCodeSuggestion}
                      label={decision === 'approved' ? 'Approve' : 'Reject'}
                    >
                      <input type="hidden" name="suggestionId" value={s.id} />
                      <input type="hidden" name="decision" value={decision} />
                    </ActionForm>
                  ))}
                </div>
              )}
              {canManage(role) && s.status === 'approved' && (
                <ActionForm action={applyCodeSuggestion} label="Apply approved change">
                  <input type="hidden" name="suggestionId" value={s.id} />
                </ActionForm>
              )}
            </article>
          ))}
        </section>
        <section className="settings-card">
          <h2>Team discussion</h2>
          {canWrite(role) && (
            <Dialog title="Add a code comment" trigger="Add comment">
              <ActionForm action={addCodeComment} label="Post comment">
                <input type="hidden" name="sessionId" value={sessionId} />
                <label>
                  Your comment
                  <textarea
                    name="body"
                    required
                    maxLength={2000}
                    placeholder="Explain a change, ask a question, or leave a review…"
                  />
                </label>
              </ActionForm>
            </Dialog>
          )}
          <ol className="team-notes">
            {comments.map((c) => (
              <li key={c.id}>
                <p className="note-body">{c.body}</p>
                <small>
                  {c.author} · {c.createdAt.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' })}
                </small>
              </li>
            ))}
          </ol>
          {!comments.length && <p className="muted">Keep the conversation with the code.</p>}
        </section>
      </div>
    </section>
  );
}

import { ProjectNavigation } from '@/components/project-navigation';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { FolderOpen, ArrowLeft, FileText, ArrowUpRight } from 'lucide-react';
import {
  db,
  projects,
  boards,
  columns,
  tasks,
  documents,
  memberships,
  users,
} from '@flowstate/database';
import { canWrite, canManage } from '@flowstate/contracts';
import { requireUser } from '@/lib/auth';
import { userWorkspaces } from '@/lib/queries';
import { Shell } from '@/components/shell';
import { NewDocument } from '@/components/new-document';
import { ActionForm, Dialog } from '@/components/forms';
import { createBoard, createColumn } from '@/lib/work-actions';
import { Kanban } from '@/components/kanban';
export default async function Project({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
  searchParams: Promise<{ board?: string; task?: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const user = await requireUser();
  const spaces = await userWorkspaces(user.id);
  const workspace = spaces.find((w) => w.id === workspaceId);
  if (!workspace) notFound();
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) notFound();
  const [projectBoards, projectDocuments, members] = await Promise.all([
    db.select().from(boards).where(eq(boards.projectId, projectId)).orderBy(asc(boards.id)),
    db
      .select()
      .from(documents)
      .where(eq(documents.projectId, projectId))
      .orderBy(asc(documents.updatedAt)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .where(eq(memberships.workspaceId, workspaceId)),
  ]);
  const query = await searchParams;
  const selectedBoardId = query.board;
  const board = projectBoards.find((b) => b.id === selectedBoardId) || projectBoards[0];
  const boardColumns = board
    ? await db
        .select()
        .from(columns)
        .where(eq(columns.boardId, board.id))
        .orderBy(asc(columns.sortKey))
    : [];
  const boardTasks = boardColumns.length
    ? await db
        .select()
        .from(tasks)
        .where(
          inArray(
            tasks.columnId,
            boardColumns.map((c) => c.id),
          ),
        )
    : [];
  return (
    <Shell user={user} workspaces={spaces} active={workspaceId}>
      <header className="topbar">
        <span>
          {workspace.name}
          <span className="crumb">/</span>
          <strong>{project.name}</strong>
        </span>
        <span className="pill">Project</span>
      </header>
      <main className="workspace-main settings-main">
        <Link className="back-link" href={`/w/${workspaceId}`}>
          <ArrowLeft size={15} />
          All projects
        </Link>
        <section className="page-heading">
          <div>
            <p className="eyebrow">ONE SHARED DIRECTION</p>
            <h1>
              {project.name}
              <span className="heading-dot">.</span>
            </h1>
            <p className="muted">{project.description || 'A fresh space for your next idea.'}</p>
          </div>
          <div className="document-actions">
            {canWrite(workspace.role) && <NewDocument projectId={projectId} />}
            <Link className="button secondary" href={`/w/${workspaceId}/p/${projectId}/settings`}>
              Project settings
            </Link>
          </div>
        </section>
        <ProjectNavigation workspaceId={workspaceId} projectId={projectId} active="boards" />
        {canWrite(workspace.role) &&
          !projectDocuments.length &&
          !boardTasks.length &&
          projectBoards.length <= 1 && (
            <section className="project-start" aria-label="Project getting started">
              <div>
                <p className="eyebrow">START HERE</p>
                <h2>Make this project yours.</h2>
                <p>
                  Plan the next step or create a document. Your team can join whenever you’re ready.
                </p>
              </div>
              <div>
                <a href="#task-board">1. Plan your first task →</a>
                <Link href={`/w/${workspaceId}/p/${projectId}/documents`}>
                  2. Create a shared document →
                </Link>
                <Link href={`/w/${workspaceId}/settings#invite`}>
                  {canManage(workspace.role) ? '3. Bring your team in →' : '3. Meet your team →'}
                </Link>
              </div>
            </section>
          )}
        <div className="project-controls" id="task-board">
          <div className="board-tabs">
            {projectBoards.map((b) => (
              <Link
                key={b.id}
                className={board?.id === b.id ? 'selected' : ''}
                href={`?board=${b.id}`}
              >
                {b.name}
              </Link>
            ))}
          </div>
          {canWrite(workspace.role) && (
            <div className="control-actions">
              <Dialog title="Create a board" trigger="New board">
                <ActionForm action={createBoard} label="Create board">
                  <input type="hidden" name="projectId" value={projectId} />
                  <label>
                    Board name
                    <input name="name" required maxLength={80} />
                  </label>
                  <label className="checkbox-label">
                    <input type="checkbox" name="starterBoard" value="1" defaultChecked />
                    <span>
                      Use starter columns<small>To do, In progress and Done</small>
                    </span>
                  </label>
                </ActionForm>
              </Dialog>
              {board && (
                <Dialog title="Add a column" trigger="Add column">
                  <ActionForm action={createColumn} label="Create column">
                    <input type="hidden" name="boardId" value={board.id} />
                    <label>
                      Column title
                      <input name="title" required maxLength={80} />
                    </label>
                  </ActionForm>
                </Dialog>
              )}
            </div>
          )}
        </div>
        {board ? (
          <Kanban
            key={`${board.id}:${query.task || ''}`}
            focusedTaskId={
              boardTasks.some((task) => task.id === query.task) ? query.task : undefined
            }
            columns={boardColumns}
            tasks={boardTasks}
            members={members}
            editable={canWrite(workspace.role)}
          />
        ) : (
          <section className="empty-state">
            <FolderOpen size={28} />
            <h3>Give the next steps a place.</h3>
            <p>Create a board, then add columns for the way your team works.</p>
          </section>
        )}
        <section className="documents-section" id="documents">
          <div className="section-heading">
            <h2>
              <FileText size={17} />
              Recent documents <span>{projectDocuments.length}</span>
            </h2>
            <Link className="back-link" href={`/w/${workspaceId}/p/${projectId}/documents`}>
              View all documents →
            </Link>
          </div>
          {projectDocuments.length ? (
            <div className="document-list">
              {projectDocuments
                .slice(-5)
                .reverse()
                .map((document) => (
                  <Link
                    key={document.id}
                    aria-label={document.title}
                    href={`/w/${workspaceId}/p/${projectId}/d/${document.id}`}
                  >
                    <FileText size={19} />
                    <span>{document.title}</span>
                    <small className="pill">
                      {(
                        {
                          richtext: 'Document',
                          word: 'Word',
                          sheet: 'Excel',
                          slides: 'PowerPoint',
                          pdf: 'PDF',
                        } as Record<string, string>
                      )[document.kind] || 'Document'}
                    </small>
                    <ArrowUpRight size={17} />
                  </Link>
                ))}
            </div>
          ) : (
            <p className="document-empty">
              A shared space for the ideas behind the work. Create a document to start writing
              together.
            </p>
          )}
        </section>
      </main>
    </Shell>
  );
}

'use server';
import { and, asc, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  db,
  boards,
  columns,
  tasks,
  projects,
  documents,
  memberships,
  activityEvents,
} from '@flowstate/database';
import { nameSchema } from '@flowstate/contracts';
import { requireMembership } from './auth';
import type { ActionState } from './actions';
const value = (form: FormData, name: string) => String(form.get(name) ?? '');
const uuid = (form: FormData, name: string) => z.uuid().parse(value(form, name));
function failure(error: unknown): ActionState {
  if (error instanceof z.ZodError) return { error: error.issues[0].message };
  if (error instanceof Error && /permission|changed|member|not found/i.test(error.message))
    return { error: error.message };
  return { error: 'Unable to save this change. Please try again.' };
}
async function projectAccess(projectId: string) {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) throw new Error('Project not found.');
  const access = await requireMembership(project.workspaceId, 'write');
  return { project, ...access };
}
export async function createBoard(_state: ActionState, form: FormData): Promise<ActionState> {
  let destination: string;
  try {
    const projectId = uuid(form, 'projectId');
    const { project } = await projectAccess(projectId);
    const [board] = await db
      .insert(boards)
      .values({ projectId, name: nameSchema.parse(value(form, 'name')) })
      .returning();
    destination = `/w/${project.workspaceId}/p/${projectId}?board=${board.id}`;
  } catch (error) {
    return failure(error);
  }
  revalidatePath('/');
  return { success: 'Board created.', redirectTo: destination };
}
export async function createColumn(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const boardId = uuid(form, 'boardId');
    const board = await db.query.boards.findFirst({ where: eq(boards.id, boardId) });
    if (!board) throw new Error('Board not found.');
    await projectAccess(board.projectId);
    const title = nameSchema.parse(value(form, 'title'));
    await db.transaction(async (tx) => {
      await tx.select().from(boards).where(eq(boards.id, boardId)).for('update');
      const existing = await tx.select().from(columns).where(eq(columns.boardId, boardId));
      await tx.insert(columns).values({
        boardId,
        title,
        sortKey: existing.length ? Math.max(...existing.map((c) => c.sortKey)) + 1 : 0,
      });
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath('/');
  return { success: 'Column created.' };
}
export async function saveTask(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const columnId = uuid(form, 'columnId');
    const column = await db.query.columns.findFirst({ where: eq(columns.id, columnId) });
    if (!column) throw new Error('Column not found.');
    const board = await db.query.boards.findFirst({ where: eq(boards.id, column.boardId) });
    if (!board) throw new Error('Board not found.');
    const { project, user } = await projectAccess(board.projectId);
    const title = z.string().trim().min(1).max(200).parse(value(form, 'title'));
    const description = z.string().max(10000).parse(value(form, 'description'));
    const assigneeId = value(form, 'assigneeId') ? uuid(form, 'assigneeId') : null;
    if (
      assigneeId &&
      !(await db.query.memberships.findFirst({
        where: and(
          eq(memberships.workspaceId, project.workspaceId),
          eq(memberships.userId, assigneeId),
        ),
      }))
    )
      throw new Error('Assignee must be a workspace member.');
    await db.transaction(async (tx) => {
      await tx.select().from(boards).where(eq(boards.id, board.id)).for('update');
      let taskId: string;
      if (value(form, 'taskId')) {
        const existing = await tx.query.tasks.findFirst({
          where: eq(tasks.id, uuid(form, 'taskId')),
        });
        if (!existing) throw new Error('Task not found.');
        const source = await tx.query.columns.findFirst({
          where: eq(columns.id, existing.columnId),
        });
        if (source?.boardId !== board.id)
          throw new Error('You do not have permission for this task.');
        const [updated] = await tx
          .update(tasks)
          .set({
            title,
            description,
            assigneeId,
            version: sql`${tasks.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(tasks.id, existing.id),
              eq(tasks.version, z.coerce.number().int().positive().parse(value(form, 'version'))),
            ),
          )
          .returning();
        if (!updated) throw new Error('This task changed. Refresh and try again.');
        taskId = existing.id;
      } else {
        const existing = await tx.select().from(tasks).where(eq(tasks.columnId, columnId));
        const [created] = await tx
          .insert(tasks)
          .values({ title, description, assigneeId, columnId, sortKey: existing.length })
          .returning();
        taskId = created.id;
      }
      await tx.insert(activityEvents).values({
        workspaceId: project.workspaceId,
        actorId: user.id,
        action: value(form, 'taskId') ? 'task.updated' : 'task.created',
        objectType: 'task',
        objectId: taskId,
      });
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath('/');
  return { success: 'Task saved.' };
}
export async function moveTask(input: {
  taskId: string;
  columnId: string;
  index: number;
  version: number;
}): Promise<ActionState> {
  try {
    const data = z
      .object({
        taskId: z.uuid(),
        columnId: z.uuid(),
        index: z.number().int().min(0),
        version: z.number().int().positive(),
      })
      .parse(input);
    const target = await db.query.columns.findFirst({ where: eq(columns.id, data.columnId) });
    if (!target) throw new Error('Column not found.');
    const board = await db.query.boards.findFirst({ where: eq(boards.id, target.boardId) });
    if (!board) throw new Error('Board not found.');
    const { project, user } = await projectAccess(board.projectId);
    await db.transaction(async (tx) => {
      await tx.select().from(boards).where(eq(boards.id, board.id)).for('update');
      const task = await tx.query.tasks.findFirst({ where: eq(tasks.id, data.taskId) });
      if (!task) throw new Error('Task not found.');
      const source = await tx.query.columns.findFirst({ where: eq(columns.id, task.columnId) });
      if (source?.boardId !== board.id)
        throw new Error('You do not have permission for this task.');
      if (task.version !== data.version)
        throw new Error('This task changed. Refresh and try again.');
      const affected = await tx
        .select()
        .from(tasks)
        .where(sql`${tasks.columnId} in (${source.id}, ${target.id})`)
        .orderBy(asc(tasks.sortKey), asc(tasks.id));
      const destination = affected.filter((t) => t.columnId === target.id && t.id !== task.id);
      destination.splice(Math.min(data.index, destination.length), 0, task);
      const sourceTasks =
        source.id === target.id
          ? []
          : affected.filter((t) => t.columnId === source.id && t.id !== task.id);
      for (const [index, item] of destination.entries())
        await tx
          .update(tasks)
          .set({
            columnId: target.id,
            sortKey: index,
            version: sql`${tasks.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, item.id));
      for (const [index, item] of sourceTasks.entries())
        await tx
          .update(tasks)
          .set({ sortKey: index, version: sql`${tasks.version} + 1`, updatedAt: new Date() })
          .where(eq(tasks.id, item.id));
      await tx.insert(activityEvents).values({
        workspaceId: project.workspaceId,
        actorId: user.id,
        action: 'task.moved',
        objectType: 'task',
        objectId: task.id,
      });
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath('/');
  return { success: 'Task moved.' };
}
export async function createDocument(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const projectId = uuid(form, 'projectId');
    const { user } = await projectAccess(projectId);
    await db
      .insert(documents)
      .values({ projectId, createdBy: user.id, title: nameSchema.parse(value(form, 'title')) });
  } catch (error) {
    return failure(error);
  }
  revalidatePath('/');
  return { success: 'Document created.' };
}
export async function renameDocument(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const documentId = uuid(form, 'documentId');
    const document = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
    if (!document) throw new Error('Document not found.');
    await projectAccess(document.projectId);
    await db
      .update(documents)
      .set({ title: nameSchema.parse(value(form, 'title')), updatedAt: new Date() })
      .where(eq(documents.id, documentId));
  } catch (error) {
    return failure(error);
  }
  revalidatePath('/');
  return { success: 'Document renamed.' };
}

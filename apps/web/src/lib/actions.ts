'use server';
import { randomBytes } from 'node:crypto';
import { hash, compare } from 'bcryptjs';
import { and, eq, gt, ne } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  db,
  users,
  sessions,
  workspaces,
  memberships,
  projects,
  invites,
  activityEvents,
} from '@flowstate/database';
import { nameSchema, emailSchema, passwordSchema, projectSchema } from '@flowstate/contracts';
import { createSession, requireUser, requireMembership, tokenHash } from './auth';

export type ActionState = { error?: string; success?: string; invite?: string };
const text = (form: FormData, key: string) => String(form.get(key) ?? '');
const id = (form: FormData, key: string) => z.uuid().parse(text(form, key));
function message(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0].message;
  if (error instanceof Error && error.message.startsWith('You do not')) return error.message;
  return 'This action could not be completed. Please try again.';
}
// Persisted rate limiting protects authentication across process restarts and instances.
async function throttle(email: string) {
  const { pool } = await import('@flowstate/database');
  const key = tokenHash(email);
  const result = await pool.query(
    `INSERT INTO auth_limits (key, attempts, window_start) VALUES ($1, 1, now())
    ON CONFLICT (key) DO UPDATE SET attempts = CASE WHEN auth_limits.window_start < now() - interval '15 minutes' THEN 1 ELSE auth_limits.attempts + 1 END,
    window_start = CASE WHEN auth_limits.window_start < now() - interval '15 minutes' THEN now() ELSE auth_limits.window_start END RETURNING attempts`,
    [key],
  );
  if (result.rows[0].attempts > 20) throw new Error('rate limited');
}
export async function authenticate(_state: ActionState, form: FormData): Promise<ActionState> {
  const mode = text(form, 'mode');
  try {
    const email = emailSchema.parse(text(form, 'email').trim());
    const password = passwordSchema.parse(text(form, 'password'));
    await throttle(email);
    let user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (mode === 'register') {
      const name = nameSchema.parse(text(form, 'name'));
      if (user) return { error: 'Unable to create this account. Try signing in.' };
      [user] = await db
        .insert(users)
        .values({ email, name, passwordHash: await hash(password, 12) })
        .returning();
    } else if (!user || !(await compare(password, user.passwordHash)))
      return { error: 'Email or password is incorrect.' };
    await createSession(user!.id);
  } catch (error) {
    return { error: message(error) };
  }
  redirect('/');
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get('flowstate_session')?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash(token)));
  jar.delete('flowstate_session');
  redirect('/login');
}
export async function createWorkspace(_state: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  let workspaceId: string;
  try {
    const name = nameSchema.parse(text(form, 'name'));
    workspaceId = await db.transaction(async (tx) => {
      const [workspace] = await tx
        .insert(workspaces)
        .values({
          name,
          ownerId: user.id,
          slug: `${
            name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '') || 'workspace'
          }-${randomBytes(5).toString('hex')}`,
        })
        .returning();
      await tx
        .insert(memberships)
        .values({ workspaceId: workspace.id, userId: user.id, role: 'owner' });
      await tx.insert(activityEvents).values({
        workspaceId: workspace.id,
        actorId: user.id,
        action: 'workspace.created',
        objectType: 'workspace',
        objectId: workspace.id,
      });
      return workspace.id;
    });
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath('/');
  redirect(`/w/${workspaceId}`);
}
export async function saveWorkspace(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const workspaceId = id(form, 'workspaceId');
    await requireMembership(workspaceId, 'manage');
    await db
      .update(workspaces)
      .set({ name: nameSchema.parse(text(form, 'name')) })
      .where(eq(workspaces.id, workspaceId));
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath('/');
  return { success: 'Workspace updated.' };
}
export async function deleteWorkspace(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const workspaceId = id(form, 'workspaceId');
    await requireMembership(workspaceId, 'owner');
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    });
    if (text(form, 'confirmation') !== workspace?.name)
      return { error: 'Enter the workspace name to confirm deletion.' };
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath('/');
  redirect('/');
}
export async function saveProject(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const workspaceId = id(form, 'workspaceId');
    const { user } = await requireMembership(workspaceId, 'write');
    const data = projectSchema.parse({
      name: text(form, 'name'),
      description: text(form, 'description'),
    });
    if (text(form, 'projectId'))
      await db
        .update(projects)
        .set(data)
        .where(and(eq(projects.id, id(form, 'projectId')), eq(projects.workspaceId, workspaceId)));
    else await db.insert(projects).values({ ...data, workspaceId, createdBy: user.id });
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath('/');
  return { success: 'Project saved.' };
}
export async function deleteProject(_state: ActionState, form: FormData): Promise<ActionState> {
  let workspaceId: string;
  try {
    workspaceId = id(form, 'workspaceId');
    await requireMembership(workspaceId, 'manage');
    await db
      .delete(projects)
      .where(and(eq(projects.id, id(form, 'projectId')), eq(projects.workspaceId, workspaceId)));
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath('/');
  redirect(`/w/${workspaceId}`);
}
export async function inviteMember(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const workspaceId = id(form, 'workspaceId');
    const { user, member } = await requireMembership(workspaceId, 'manage');
    const email = emailSchema.parse(text(form, 'email').trim());
    const role = z.enum(['admin', 'editor', 'viewer']).parse(text(form, 'role'));
    if (role === 'admin' && member.role !== 'owner')
      return { error: 'Only the owner can appoint admins.' };
    const token = randomBytes(32).toString('base64url');
    await db.transaction(async (tx) => {
      const [invite] = await tx
        .insert(invites)
        .values({
          workspaceId,
          email,
          role,
          tokenHash: tokenHash(token),
          expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        })
        .returning();
      await tx.insert(activityEvents).values({
        workspaceId,
        actorId: user.id,
        action: 'member.invited',
        objectType: 'invite',
        objectId: invite.id,
      });
    });
    return {
      success:
        'Invitation created. Share this link with the invited person. It expires in 48 hours.',
      invite: `/join/${token}`,
    };
  } catch (error) {
    return { error: message(error) };
  }
}
export async function acceptInvite(_state: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  let workspaceId: string;
  try {
    workspaceId = await db.transaction(async (tx) => {
      const [invite] = await tx
        .select()
        .from(invites)
        .where(
          and(
            eq(invites.tokenHash, tokenHash(text(form, 'token'))),
            eq(invites.email, user.email),
            gt(invites.expiresAt, new Date()),
          ),
        )
        .for('update');
      if (!invite) throw new Error('invalid invite');
      await tx
        .insert(memberships)
        .values({ workspaceId: invite.workspaceId, userId: user.id, role: invite.role })
        .onConflictDoNothing();
      await tx.delete(invites).where(eq(invites.id, invite.id));
      await tx.insert(activityEvents).values({
        workspaceId: invite.workspaceId,
        actorId: user.id,
        action: 'member.joined',
        objectType: 'user',
        objectId: user.id,
      });
      return invite.workspaceId;
    });
  } catch {
    return {
      error: 'This invitation is expired, already used, or belongs to another email address.',
    };
  }
  revalidatePath('/');
  redirect(`/w/${workspaceId}`);
}
export async function updateMember(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const workspaceId = id(form, 'workspaceId');
    const { user, member } = await requireMembership(workspaceId, 'manage');
    const userId = id(form, 'userId');
    const target = await db.query.memberships.findFirst({
      where: and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)),
    });
    if (!target || target.role === 'owner' || (member.role === 'admin' && target.role === 'admin'))
      return { error: 'Only the owner can manage admins. The owner cannot be removed.' };
    const role = text(form, 'role');
    if (member.role !== 'owner' && role === 'admin')
      return { error: 'Only the owner can appoint admins.' };
    await db.transaction(async (tx) => {
      const where = and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.userId, userId),
        ne(memberships.role, 'owner'),
      );
      if (role === 'remove') await tx.delete(memberships).where(where);
      else
        await tx
          .update(memberships)
          .set({ role: z.enum(['admin', 'editor', 'viewer']).parse(role) })
          .where(where);
      await tx.insert(activityEvents).values({
        workspaceId,
        actorId: user.id,
        action: role === 'remove' ? 'member.removed' : 'member.role_changed',
        objectType: 'user',
        objectId: userId,
      });
    });
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath('/');
  return { success: 'Membership updated.' };
}

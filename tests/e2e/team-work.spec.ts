import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
test('team notes, task priorities and guarded deletion work across workspace roles', async ({
  page,
  browser,
}) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const owner = randomUUID(),
    viewerId = randomUUID(),
    team = randomUUID(),
    personal = randomUUID(),
    project = randomUUID(),
    otherProject = randomUUID(),
    board = randomUUID(),
    otherBoard = randomUUID(),
    column = randomUUID(),
    otherColumn = randomUUID(),
    privateTask = randomUUID();
  const ownerToken = randomUUID(),
    viewerToken = randomUUID();
  const viewerContext = await browser.newContext(),
    viewer = await viewerContext.newPage();
  const base = 'http://localhost:3000';
  try {
    for (const [id, token, name] of [
      [owner, ownerToken, 'Note owner'],
      [viewerId, viewerToken, 'Note viewer'],
    ]) {
      await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)', [
        id,
        name,
        `${id}@test.local`,
        'unused',
      ]);
      await pool.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
        [createHash('sha256').update(token).digest('hex'), id],
      );
    }
    await pool.query(
      'INSERT INTO workspaces(id,name,slug,owner_id) VALUES($1,$2,$3,$4),($5,$6,$7,$8)',
      [
        team,
        'Team notes',
        `team-${team}`,
        owner,
        personal,
        'Personal',
        `personal-${personal}`,
        viewerId,
      ],
    );
    await pool.query(
      "INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'viewer'),($4,$3,'owner')",
      [team, owner, viewerId, personal],
    );
    for (const [id, workspaceId, author] of [
      [project, team, owner],
      [otherProject, personal, viewerId],
    ])
      await pool.query(
        'INSERT INTO projects(id,workspace_id,name,created_by) VALUES($1,$2,$3,$4)',
        [id, workspaceId, 'Work checks', author],
      );
    for (const [id, pid] of [
      [board, project],
      [otherBoard, otherProject],
    ])
      await pool.query('INSERT INTO boards(id,project_id,name) VALUES($1,$2,$3)', [
        id,
        pid,
        'Planning',
      ]);
    for (const [id, bid] of [
      [column, board],
      [otherColumn, otherBoard],
    ])
      await pool.query('INSERT INTO board_columns(id,board_id,title,sort_key) VALUES($1,$2,$3,0)', [
        id,
        bid,
        'Ready',
      ]);
    await pool.query('INSERT INTO tasks(id,column_id,title,sort_key) VALUES($1,$2,$3,0)', [
      privateTask,
      otherColumn,
      'Private task',
    ]);
    await page.context().addCookies([{ name: 'flowstate_session', value: ownerToken, url: base }]);
    await viewerContext.addCookies([{ name: 'flowstate_session', value: viewerToken, url: base }]);
    await page.goto(`/w/${team}`);
    await expect(page.getByRole('region', { name: 'Workspace presence' })).toContainText(
      'here now',
    );
    const presencePath = `${base}/api/v1/workspaces/${team}/presence`;
    const heartbeat = { headers: { origin: base } };
    expect(
      (
        await page.request.post(presencePath, { headers: { origin: 'https://other.example' } })
      ).status(),
    ).toBe(403);
    await viewer.request.post(presencePath, heartbeat);
    let presence = await (await page.request.post(presencePath, heartbeat)).json();
    expect(presence.people.map((person: { name: string }) => person.name).sort()).toEqual([
      'Note owner',
      'Note viewer',
    ]);
    expect(
      (
        await page.request.post(`${base}/api/v1/workspaces/${personal}/presence`, heartbeat)
      ).status(),
    ).toBe(404);
    await pool.query(
      "UPDATE workspace_presence SET last_seen_at=now()-interval '1 minute' WHERE session_hash=$1",
      [createHash('sha256').update(viewerToken).digest('hex')],
    );
    presence = await (await page.request.post(presencePath, heartbeat)).json();
    expect(presence.people.map((person: { name: string }) => person.name)).toEqual(['Note owner']);
    await page.getByRole('button', { name: 'Share note', exact: true }).click();
    await page.getByLabel('Your note').fill('Review the prototype together.');
    await page.getByRole('dialog').getByRole('button', { name: 'Share note', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Review the prototype together.', { exact: true })).toBeVisible();
    await viewer.goto(`/w/${team}`);
    await expect(viewer.getByText('Review the prototype together.', { exact: true })).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'Share note', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Share note', exact: true }).click();
    await page.getByLabel('Your note').fill('A second update arrives without a reload.');
    await page.getByRole('dialog').getByRole('button', { name: 'Share note', exact: true }).click();
    await expect(
      viewer.getByText('A second update arrives without a reload.', { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await viewer.goto(`/w/${personal}`);
    await viewer.getByRole('button', { name: 'Share note', exact: true }).click();
    await viewer.getByLabel('Your note').fill('Blocked forged note');
    await viewer.locator('input[name="workspaceId"]').evaluate((input, id) => {
      (input as HTMLInputElement).value = id;
    }, team);
    await viewer
      .getByRole('dialog')
      .getByRole('button', { name: 'Share note', exact: true })
      .click();
    await expect(viewer.getByRole('dialog').getByRole('alert')).toContainText('permission');
    await page.goto(`/w/${team}/p/${project}`);
    await page.getByRole('button', { name: 'Add task to Ready' }).click();
    await page.getByLabel('Task title').fill('Review prototype');
    await page.getByLabel('Priority', { exact: true }).selectOption('urgent');
    await page.getByRole('button', { name: 'Create task', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Review prototype', exact: true })).toBeVisible();
    await page.reload();
    const taskCard = page
      .locator('.task-card')
      .filter({ has: page.getByRole('button', { name: 'Review prototype', exact: true }) });
    await expect(taskCard.locator('.task-priority')).toHaveText('urgent');
    await page.goto(`/w/${team}`);
    await expect(page.getByLabel('Workspace task summary')).toHaveText(
      '1 tasks · 0 assigned to you',
    );
    await page.goto(`/w/${team}/p/${project}`);
    await page.getByRole('button', { name: 'Review prototype', exact: true }).click();
    await page.getByRole('button', { name: 'Delete task', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[name="taskId"]').evaluate((input, id) => {
      (input as HTMLInputElement).value = id;
    }, privateTask);
    await dialog.getByRole('button', { name: 'Confirm task deletion', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('permission');
    await dialog.getByRole('button', { name: 'Close dialog' }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Review prototype', exact: true }).click();
    await page.getByRole('button', { name: 'Delete task', exact: true }).click();
    await pool.query('UPDATE tasks SET version=version+1 WHERE column_id=$1', [column]);
    await page.getByRole('button', { name: 'Confirm task deletion', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('changed');
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Review prototype', exact: true }).click();
    await page.getByRole('button', { name: 'Delete task', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm task deletion', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Review prototype', exact: true })).toHaveCount(
      0,
    );
    expect((await pool.query('SELECT id FROM tasks WHERE id=$1', [privateTask])).rowCount).toBe(1);
  } finally {
    await viewerContext.close();
    await pool.query('DELETE FROM workspaces WHERE id=ANY($1::uuid[])', [[team, personal]]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[owner, viewerId]]);
    await pool.end();
  }
});

import 'dotenv/config';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
test('activity has its own accessible, filtered, paginated workspace timeline', async ({
  browser,
}) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const workspace = randomUUID(),
    otherWorkspace = randomUUID(),
    ids = [randomUUID(), randomUUID(), randomUUID()];
  const contexts = [];
  try {
    for (const [index, id] of ids.entries()) {
      const token = randomUUID();
      await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)', [
        id,
        ['Alex Morgan', 'Sam Rivera', 'Unrelated user'][index],
        `${id}@activity.test`,
        'unused',
      ]);
      await pool.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
        [createHash('sha256').update(token).digest('hex'), id],
      );
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addCookies([
        { name: 'flowstate_session', value: token, url: 'http://localhost:3000' },
      ]);
      contexts.push(context);
    }
    for (const [id, name, owner] of [
      [workspace, 'Northstar Studio', ids[0]],
      [otherWorkspace, 'Private team', ids[2]],
    ])
      await pool.query('INSERT INTO workspaces(id,name,slug,owner_id) VALUES($1,$2,$3,$4)', [
        id,
        name,
        `activity-${id}`,
        owner,
      ]);
    await pool.query(
      "INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'viewer'),($4,$5,'owner')",
      [workspace, ids[0], ids[1], otherWorkspace, ids[2]],
    );
    for (let index = 0; index < 31; index++)
      await pool.query(
        'INSERT INTO activity_events(workspace_id,actor_id,action,object_type,object_id,created_at) VALUES($1,$2,$3,$4,$5,$6)',
        [
          workspace,
          ids[0],
          index === 30
            ? 'document.created'
            : index === 29
              ? 'file.uploaded'
              : index === 0
                ? 'workspace.created'
                : ['task.created', 'task.moved', 'task.updated'][index % 3],
          'workspace',
          workspace,
          new Date(Date.UTC(2026, 10, 8, 17, 0, index)),
        ],
      );
    await pool.query(
      "INSERT INTO activity_events(workspace_id,actor_id,action,object_type,object_id) VALUES($1,$2,'repository.connected','project',$3)",
      [otherWorkspace, ids[2], randomUUID()],
    );
    const page = await contexts[0].newPage();
    await page.goto(`/w/${workspace}`);
    await expect(page.getByRole('heading', { name: 'Recent activity', exact: true })).toHaveCount(
      0,
    );
    await page.goto(`/w/${workspace}/settings`);
    await expect(page.getByRole('heading', { name: 'Recent activity', exact: true })).toHaveCount(
      0,
    );
    await page
      .getByRole('navigation', { name: 'Workspace navigation' })
      .getByRole('link', { name: 'Activity', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Recent activity', exact: true })).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Workspace navigation' })
        .getByRole('link', { name: 'Activity', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.activity-timeline li')).toHaveCount(25);
    await expect(page.locator('.activity-timeline li').first()).toContainText(
      'Alex Morgan created a document',
    );
    await expect(page.locator('.activity-timeline')).not.toContainText('Unrelated user');
    await page.getByRole('link', { name: 'Older activity', exact: true }).click();
    await expect(page.locator('.activity-timeline li')).toHaveCount(6);
    await expect(page.locator('.activity-timeline')).toContainText('created the workspace');
    await page.getByRole('combobox', { name: 'Show activity', exact: true }).selectOption('tasks');
    await page.getByRole('button', { name: 'Apply filter', exact: true }).click();
    await expect(page.locator('.activity-timeline li')).toHaveCount(25);
    await expect(page.locator('.activity-timeline')).not.toContainText('created a document');
    await page.getByRole('link', { name: 'Older activity', exact: true }).click();
    await expect(page.locator('.activity-timeline li')).toHaveCount(3);
    await page
      .getByRole('combobox', { name: 'Show activity', exact: true })
      .selectOption('documents');
    await page.getByRole('button', { name: 'Apply filter', exact: true }).click();
    await expect(page.locator('.activity-timeline li')).toHaveCount(2);
    await expect(page.locator('.activity-timeline')).toContainText('uploaded a file');
    await page
      .getByRole('navigation', { name: 'Workspace navigation' })
      .getByRole('link', { name: 'Activity', exact: true })
      .click();
    await expect(page.getByRole('combobox', { name: 'Show activity', exact: true })).toHaveValue(
      'all',
    );
    await expect(page.locator('.activity-timeline li')).toHaveCount(25);
    const viewer = await contexts[1].newPage();
    await viewer.goto(`/w/${workspace}/activity`);
    await expect(viewer.locator('.activity-timeline li')).toHaveCount(25);
    const outsider = await contexts[2].newPage();
    await outsider.goto(`/w/${workspace}/activity`);
    await expect(
      outsider.getByRole('heading', { name: 'This page isn’t available.' }),
    ).toBeVisible();
    await page.goto(`/w/${workspace}/activity`);
    await page.evaluate(() => document.fonts.ready);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({ path: '.local/activity-desktop.png', fullPage: false });
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width);
      await expect(
        page.getByRole('link', { name: 'Members & settings', exact: true }),
      ).toBeVisible();
      if (width === 390) {
        expect(
          (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
            .violations,
        ).toEqual([]);
        await page.screenshot({ path: '.local/activity-mobile.png', fullPage: false });
      }
    }
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
    await pool.query('DELETE FROM workspaces WHERE id=ANY($1::uuid[])', [
      [workspace, otherWorkspace],
    ]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [ids]);
    await pool.end();
  }
});

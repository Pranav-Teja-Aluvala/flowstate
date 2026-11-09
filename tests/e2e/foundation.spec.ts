import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { Client } from 'pg';

async function register(page: Page, name: string, email: string) {
  await page.goto('/login?mode=register');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('A unique test passphrase 2026');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Create your workspace', exact: true }),
  ).toBeVisible();
}
test('accounts, persisted projects, invitations, workspace isolation, and viewer authorization', async ({
  browser,
}) => {
  const suffix = Date.now();
  const ownerContext = await browser.newContext();
  const viewerContext = await browser.newContext();
  const strangerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const viewer = await viewerContext.newPage();
  const stranger = await strangerContext.newPage();
  await register(owner, 'Alex Morgan', `owner-${suffix}@flowstate.test`);
  await owner.getByLabel('Workspace name', { exact: true }).fill('Northstar Studio');
  await owner.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(owner.getByRole('heading', { name: 'Your projects.' })).toBeVisible();
  const workspaceUrl = owner.url();
  await owner.getByRole('button', { name: 'New project', exact: true }).click();
  await owner.getByLabel('Project name').fill('Brand refresh');
  await owner
    .getByLabel('Description')
    .fill(
      'A clearer identity for the next chapter. Strategy, design, and the details that connect them.',
    );
  await owner.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(owner.getByRole('status')).toHaveText('Project saved.');
  await expect(owner.getByRole('dialog')).toHaveCount(0);
  await owner.reload();
  await expect(owner.getByRole('heading', { name: 'Brand refresh' })).toBeVisible();
  await owner.getByRole('link', { name: /Brand refresh/ }).click();
  await expect(owner).toHaveURL(/\/p\/[a-f0-9-]+$/);
  const projectUrl = owner.url();
  await owner.getByRole('link', { name: 'Project settings' }).click();
  await owner.getByLabel('Description').fill('A shared direction for the studio’s next chapter.');
  await owner.getByRole('button', { name: 'Save changes' }).click();
  await expect(owner.getByRole('status')).toHaveText('Project saved.');
  await owner.reload();
  await owner.getByText('Project details', { exact: true }).click();
  await expect(owner.getByLabel('Description')).toHaveValue(
    'A shared direction for the studio’s next chapter.',
  );

  await register(viewer, 'Sam Rivera', `viewer-${suffix}@flowstate.test`);
  await register(stranger, 'Taylor Chen', `stranger-${suffix}@flowstate.test`);
  await stranger.goto(workspaceUrl);
  await expect(stranger.getByRole('heading', { name: 'This page isn’t available.' })).toBeVisible();
  await stranger.goto(projectUrl);
  await expect(stranger.getByRole('heading', { name: 'This page isn’t available.' })).toBeVisible();

  await owner.goto(`${workspaceUrl}/settings`);
  await owner.getByLabel('Email address').fill(`viewer-${suffix}@flowstate.test`);
  await owner.getByLabel('Workspace role').selectOption('viewer');
  await owner.getByRole('button', { name: 'Create invitation', exact: true }).click();
  let inviteUrl = await owner.getByLabel('Invitation link').inputValue();
  await stranger.goto(inviteUrl);
  await stranger.getByRole('button', { name: 'Join workspace' }).click();
  await expect(stranger.locator('.feedback.error')).toContainText('belongs to another email');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(
    "UPDATE invites SET expires_at=now() - interval '1 minute' WHERE token_hash=$1",
    [createHash('sha256').update(inviteUrl.split('/').at(-1)!).digest('hex')],
  );
  await client.end();
  await viewer.goto(inviteUrl);
  await viewer.getByRole('button', { name: 'Join workspace' }).click();
  await expect(viewer.locator('.feedback.error')).toContainText('expired');
  await owner.getByLabel('Email address').fill(`viewer-${suffix}@flowstate.test`);
  await owner.getByLabel('Workspace role').selectOption('viewer');
  await owner.getByRole('button', { name: 'Create invitation', exact: true }).click();
  await expect.poll(() => owner.getByLabel('Invitation link').inputValue()).not.toBe(inviteUrl);
  inviteUrl = await owner.getByLabel('Invitation link').inputValue();
  await viewer.goto(inviteUrl);
  await viewer.getByRole('button', { name: 'Join workspace' }).click();
  await expect(viewer.getByRole('heading', { name: 'Your projects.' })).toBeVisible();
  await viewer.goto(inviteUrl);
  await viewer.getByRole('button', { name: 'Join workspace' }).click();
  await expect(viewer.locator('.feedback.error')).toContainText('already used');
  await viewer.goto(workspaceUrl);
  await expect(viewer.getByRole('button', { name: 'New project' })).toHaveCount(0);
  await viewer.goto(projectUrl);
  await viewer.getByRole('link', { name: 'Project settings' }).click();
  await expect(viewer.getByText('You have view-only access')).toBeVisible();

  // Attempt a real server action write by forging an owned-workspace form's ID.
  await viewer.goto('/?new=1');
  await viewer.getByLabel('Workspace name', { exact: true }).fill('Viewer personal space');
  await viewer.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await viewer.getByRole('button', { name: 'New project', exact: true }).click();
  await viewer.getByLabel('Project name').fill('Unauthorized project');
  await viewer.locator('input[name="workspaceId"]').evaluate((input, workspaceId) => {
    (input as HTMLInputElement).value = workspaceId;
  }, workspaceUrl.split('/').at(-1)!);
  await viewer.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(viewer.locator('.feedback.error')).toContainText('do not have permission');
  await owner.goto(workspaceUrl);
  await expect(owner.getByRole('heading', { name: 'Unauthorized project' })).toHaveCount(0);

  await owner.goto(`${workspaceUrl}/settings`);
  await owner.getByRole('combobox', { name: 'Role for Sam Rivera' }).selectOption('remove');
  await owner.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(owner.getByRole('combobox', { name: 'Role for Sam Rivera' })).toHaveCount(0);
  await viewer.goto(projectUrl);
  await expect(viewer.getByRole('heading', { name: 'This page isn’t available.' })).toBeVisible();

  await owner.goto(workspaceUrl);
  await mkdir('docs/screenshots', { recursive: true });
  await expect(owner.getByRole('heading', { name: 'Your projects.' })).toBeVisible();
  await owner.screenshot({
    path: 'docs/screenshots/workspace-desktop.png',
    fullPage: true,
    caret: 'initial',
  });
  await owner.setViewportSize({ width: 390, height: 844 });
  await owner.screenshot({
    path: 'docs/screenshots/workspace-mobile.png',
    fullPage: true,
    caret: 'initial',
  });
  expect(
    await owner.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await owner.setViewportSize({ width: 1280, height: 900 });
  await owner.getByRole('button', { name: 'Sign out' }).click();
  await expect(owner).toHaveURL(/\/login$/);
  await owner.getByLabel('Email address').fill(`owner-${suffix}@flowstate.test`);
  await owner.getByLabel('Password', { exact: true }).fill('A unique test passphrase 2026');
  await owner.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(owner.getByRole('heading', { name: 'Your projects.' })).toBeVisible();
  await ownerContext.close();
  await viewerContext.close();
  await strangerContext.close();
});

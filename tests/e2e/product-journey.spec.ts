import 'dotenv/config';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
test('customer journey: starter project, assigned task, document library, invitation signup and capability guidance', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const owner = randomUUID(),
    workspace = randomUUID(),
    token = randomUUID();
  const colleagueEmail = `${randomUUID()}@journey.test`;
  const context = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: { width: 1280, height: 900 },
  });
  const teammateContext = await browser.newContext();
  try {
    await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)', [
      owner,
      'Alex Morgan',
      `${owner}@journey.test`,
      'unused',
    ]);
    await pool.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [createHash('sha256').update(token).digest('hex'), owner],
    );
    await pool.query('INSERT INTO workspaces(id,name,slug,owner_id) VALUES($1,$2,$3,$4)', [
      workspace,
      'Northstar Studio',
      `journey-${workspace}`,
      owner,
    ]);
    await pool.query("INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')", [
      workspace,
      owner,
    ]);
    await context.addCookies([
      { name: 'flowstate_session', value: token, url: 'http://localhost:3000' },
    ]);
    const page = await context.newPage(),
      teammate = await teammateContext.newPage();
    const workspaceURL = `/w/${workspace}`;
    await page.goto(workspaceURL);
    await page.getByRole('button', { name: 'Create your first project', exact: true }).click();
    await page.getByLabel('Project name', { exact: true }).fill('Client launch');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect(page).toHaveURL(/\/p\/[a-f0-9-]+$/);
    const projectURL = new URL(page.url()).pathname;
    for (const name of ['To do', 'In progress', 'Done'])
      await expect(page.getByRole('region', { name: `${name} column`, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Add task to To do', exact: true }).click();
    await page.getByLabel('Task title', { exact: true }).fill('Review the launch plan');
    await page.getByLabel('Assignee', { exact: true }).selectOption(owner);
    await page.getByRole('button', { name: 'Create task', exact: true }).click();
    await page.getByRole('button', { name: 'Done adding tasks', exact: true }).click();
    await page.goto(workspaceURL);
    await page.getByRole('link', { name: /Review the launch plan/ }).click();
    await expect(page).toHaveURL(/\?board=.*#task-/);
    await expect(page.locator('.task-card[data-focused="true"]')).toContainText(
      'Review the launch plan',
    );
    const navigation = page.getByRole('navigation', { name: 'Project areas' });
    await navigation.getByRole('link', { name: 'Documents', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Start with a blank page.' })).toBeVisible();
    for (const [kind, title] of [
      ['Word', 'Launch brief'],
      ['Excel', 'Budget'],
    ]) {
      await page.getByRole('button', { name: 'New document', exact: true }).click();
      await page.getByRole('button', { name: `Create ${kind}`, exact: true }).click();
      await page.getByLabel('Document title', { exact: true }).fill(title);
      await page.getByRole('button', { name: 'Create document', exact: true }).click();
      await expect(page).toHaveURL(/\/d\/[a-f0-9-]+$/);
      if (kind === 'Word')
        await page
          .getByRole('textbox', { name: 'Document content', exact: true })
          .fill('Shape the plan together.');
      else await page.getByLabel('Cell A1', { exact: true }).fill('1200');
      await expect(page.getByTestId('save-status')).toHaveText('Saved to database');
      await expect(
        navigation.getByRole('link', { name: 'Documents', exact: true }),
      ).toHaveAttribute('aria-current', 'page');
      await navigation.getByRole('link', { name: 'Documents', exact: true }).click();
    }
    await page.getByRole('searchbox', { name: 'Search documents', exact: true }).fill('launch');
    await expect(page.locator('.library-list > a')).toHaveCount(1);
    await page.getByRole('combobox', { name: 'Document type', exact: true }).selectOption('sheet');
    await expect(page.getByRole('heading', { name: 'No matching documents.' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await page.getByRole('combobox', { name: 'Sort documents', exact: true }).selectOption('title');
    await expect(page.locator('.library-list > a').first()).toHaveAccessibleName('Budget');
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true });
    if (await dismiss.count()) await dismiss.click();
    await page.screenshot({ path: '.local/product-documents.png', fullPage: true });
    await page.setViewportSize({ width: 320, height: 760 });
    await expect(
      page.getByRole('link', { name: 'Help & getting started', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: '.local/product-documents-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${workspaceURL}/settings#invite`);
    await page.getByLabel('Email address', { exact: true }).fill(colleagueEmail);
    await page.getByRole('button', { name: 'Create invitation', exact: true }).click();
    const invite = await page.getByLabel('Invitation link', { exact: true }).inputValue();
    await page.getByRole('button', { name: 'Copy invitation link', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Link copied', exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(invite);
    await teammate.goto(invite);
    await expect(teammate).toHaveURL(/\/login\?next=/);
    await teammate.getByRole('link', { name: 'Create an account', exact: true }).click();
    await teammate.getByLabel('Your name', { exact: true }).fill('Sam Rivera');
    await teammate.getByLabel('Email address', { exact: true }).fill(colleagueEmail);
    await teammate
      .getByLabel('Password', { exact: true })
      .fill('A shared customer test passphrase');
    await teammate.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(teammate).toHaveURL(invite);
    await teammate.goto(`${projectURL}/documents`);
    await expect(
      teammate.getByRole('heading', { name: 'This page isn’t available.' }),
    ).toBeVisible();
    await teammate.goto(invite);
    await teammate.getByRole('button', { name: 'Join workspace', exact: true }).click();
    await expect(teammate).toHaveURL(new RegExp(`${workspaceURL}$`));
    await teammate.goto(`${projectURL}/documents`);
    await teammate.getByRole('link', { name: 'Launch brief', exact: true }).click();
    await expect(
      teammate.getByRole('textbox', { name: 'Document content', exact: true }),
    ).toHaveAttribute('contenteditable', 'true');
    await page.goto(`${projectURL}/files`);
    const pdf = await page.pdf();
    await page
      .getByLabel('Add a project file', { exact: true })
      .setInputFiles({ name: 'Shared plan.pdf', mimeType: 'application/pdf', buffer: pdf });
    await page.getByRole('button', { name: 'Upload file', exact: true }).click();
    await page.getByRole('link', { name: 'File details', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Keep working with this file.' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Export saved file as PDF', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('link', { name: 'Help & getting started', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'From an idea to shared work.' })).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.goto(workspaceURL);
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByLabel('Project name', { exact: true }).fill('Research space');
    await page.getByLabel('Start with a task board').uncheck();
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Give the next steps a place.' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'To do column', exact: true })).toHaveCount(0);
  } finally {
    await context.close();
    await teammateContext.close();
    await pool.query('DELETE FROM workspaces WHERE id=$1', [workspace]);
    await pool.query('DELETE FROM users WHERE id=$1 OR email=$2', [owner, colleagueEmail]);
    await pool.end();
  }
});

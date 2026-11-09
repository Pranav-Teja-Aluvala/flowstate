import { test, expect } from '@playwright/test';
test('creation dialogs close on success, stay on validation errors, and deletion belongs in settings', async ({
  page,
}) => {
  await page.goto('/login?mode=register');
  await page.getByLabel('Your name').fill('Usability tester');
  await page.getByLabel('Email address').fill(`usability-${Date.now()}@test.local`);
  await page.getByLabel('Password', { exact: true }).fill('Usability testing passphrase 2026');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Create your workspace' })).toBeVisible();
  await page.getByLabel('Workspace name').fill('Usability checks');
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your projects.' })).toBeVisible();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Project name').fill('   ');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.feedback.error')).toBeVisible();
  await page.getByLabel('Project name').fill('Disposable project');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Disposable project', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: /Disposable project/ }).click();
  await expect(page).toHaveURL(/\/p\/[a-f0-9-]+$/);
  const projectUrl = page.url();
  await expect(page.getByRole('button', { name: 'Delete project', exact: true })).toHaveCount(0);
  await expect(page.getByText('Danger zone', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'New board' }).click();
  await page.getByLabel('Board name').fill('Planning');
  await page.getByRole('button', { name: 'Create board', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Planning', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add column' }).click();
  await page.getByLabel('Column title').fill('In progress');
  await page.getByRole('button', { name: 'Create column', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'In progress column' })).toBeVisible();
  await page.getByRole('button', { name: 'New document' }).click();
  await page.getByLabel('Document title').fill('Shared brief');
  await page.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Shared brief', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /Code & GitHub/ }).click();
  await expect(page.getByRole('heading', { name: 'Code, together.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Connect your GitHub account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create branch & pull request' })).toHaveCount(0);
  await page.goto(`${projectUrl}/settings`);
  await expect(page.getByRole('heading', { name: 'Danger zone' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete project', exact: true }).click();
  await page.getByLabel('Project name confirmation').fill('wrong project');
  await page.getByRole('button', { name: 'Permanently delete project', exact: true }).click();
  await expect(page.locator('.feedback.error')).toContainText('exact project name');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Project name confirmation').fill('Disposable project');
  await page.getByRole('button', { name: 'Permanently delete project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your projects.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Disposable project', exact: true })).toHaveCount(
    0,
  );
});

import { test, expect } from '@playwright/test';
test('board ordering persists and two authorized users edit one rich-text document', async ({
  browser,
}) => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const teammateContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const teammate = await teammateContext.newPage();
  const suffix = Date.now();
  for (const [page, name, email] of [
    [owner, 'Alex Morgan', `alex-${suffix}@test.local`],
    [teammate, 'Sam Rivera', `sam-${suffix}@test.local`],
  ] as const) {
    await page.goto('/login?mode=register');
    await page.getByLabel('Your name').fill(name);
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('Our shared test passphrase 2026');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Create your workspace' })).toBeVisible();
  }
  await owner.getByLabel('Workspace name').fill('Northstar Studio');
  await owner.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(owner.getByRole('heading', { name: 'Your projects.' })).toBeVisible();
  const workspaceUrl = owner.url();
  await owner.getByRole('button', { name: 'New project' }).click();
  await owner.getByLabel('Project name').fill('Studio launch');
  await owner.getByLabel('Description').fill('A thoughtful launch for our next chapter.');
  await owner.getByRole('button', { name: 'Create project' }).click();
  await expect(owner.getByText('Project saved.')).toBeVisible();
  await expect(owner.getByRole('dialog')).toHaveCount(0);
  await owner.getByRole('link', { name: /Studio launch/ }).click();
  await expect(owner).toHaveURL(/\/p\/[a-f0-9-]+$/);
  const projectUrl = owner.url();
  await owner.getByRole('button', { name: 'New board' }).click();
  await owner.getByLabel('Board name').fill('Launch roadmap');
  await owner.getByRole('button', { name: 'Create board', exact: true }).click();
  await expect(owner.getByText('Board created.')).toBeVisible();
  await expect(owner.getByRole('dialog')).toHaveCount(0);
  for (const column of ['To do', 'In progress', 'Done']) {
    await owner.getByRole('button', { name: 'Add column' }).click();
    await owner.getByLabel('Column title').fill(column);
    await owner.getByRole('button', { name: 'Create column', exact: true }).click();
    await expect(owner.getByText('Column created.')).toBeVisible();
    await expect(owner.getByRole('dialog')).toHaveCount(0);
  }
  await owner.getByRole('button', { name: 'Add task to To do' }).click();
  for (const title of ['Set the creative direction', 'Build the launch checklist']) {
    await owner.getByLabel('Task title').fill(title);
    await owner
      .getByLabel('Task description')
      .fill('Bring the team together around a clear next step.');
    await owner.getByLabel('Assignee', { exact: true }).selectOption({ label: 'Alex Morgan' });
    await owner.getByRole('button', { name: 'Create task', exact: true }).click();
    await expect(owner.getByText('Task saved.')).toBeVisible();
  }
  await owner.getByRole('button', { name: 'Done adding tasks' }).click();
  await owner
    .getByRole('combobox', { name: 'Move Set the creative direction', exact: true })
    .selectOption({ label: 'In progress' });
  await expect(
    owner
      .getByRole('region', { name: 'In progress column' })
      .getByText('Set the creative direction', { exact: true }),
  ).toBeVisible();
  await owner.reload();
  await expect(
    owner
      .getByRole('region', { name: 'In progress column' })
      .getByText('Set the creative direction', { exact: true }),
  ).toBeVisible();
  await owner.screenshot({
    path: 'docs/screenshots/kanban-desktop.png',
    fullPage: true,
    caret: 'initial',
  });
  await owner.getByRole('button', { name: 'New document' }).click();
  await owner.getByLabel('Document title').fill('The launch brief');
  await owner.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(owner.getByText('Document created.')).toBeVisible();
  await expect(owner.getByRole('dialog')).toHaveCount(0);
  await owner.goto(`${workspaceUrl}/settings`);
  await owner.getByLabel('Email address').fill(`sam-${suffix}@test.local`);
  await owner.getByLabel('Workspace role').selectOption('editor');
  await owner.getByRole('button', { name: 'Create invitation', exact: true }).click();
  const invitation = await owner.getByLabel('Invitation link').inputValue();
  await teammate.goto(invitation);
  await teammate.getByRole('button', { name: 'Join workspace' }).click();
  await expect(teammate.getByRole('heading', { name: 'Your projects.' })).toBeVisible();
  await owner.goto(projectUrl);
  await owner.getByRole('link', { name: 'The launch brief' }).click();
  await expect(owner).toHaveURL(/\/d\/[a-f0-9-]+$/);
  const documentUrl = owner.url();
  await teammate.goto(documentUrl);
  const a = owner.getByRole('textbox', { name: 'Document content' });
  const b = teammate.getByRole('textbox', { name: 'Document content' });
  await expect(a).toHaveAttribute('contenteditable', 'true');
  await expect(b).toHaveAttribute('contenteditable', 'true');
  await a.fill('A shared direction.');
  await expect(b).toContainText('A shared direction.');
  await a.press('End');
  await b.press('End');
  await Promise.all([
    a.pressSequentially(' Thoughtful details.'),
    b.pressSequentially(' Built together.'),
  ]);
  const content = async (locator: typeof a) =>
    locator.evaluate((node) => {
      const copy = node.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('.collaboration-carets__label').forEach((label) => label.remove());
      return copy.textContent;
    });
  await expect.poll(async () => (await content(a)) === (await content(b))).toBe(true);
  expect((await content(a))!.split('').sort().join('')).toBe(
    'A shared direction. Thoughtful details. Built together.'.split('').sort().join(''),
  );
  await expect(owner.getByLabel('Online collaborators')).toContainText('2 online');
  await expect(owner.getByTestId('save-status')).toHaveText('Saved to database');
  const finalText = await content(a);
  await owner.reload();
  await expect.poll(() => content(a)).toBe(finalText);
  await a.fill('Our next chapter');
  await owner.getByRole('button', { name: 'Heading 1', exact: true }).click();
  await expect(a.locator('h1').first()).toHaveText('Our next chapter');
  await a.press('End');
  await a.press('Enter');
  await a.pressSequentially('A shared direction. Thoughtful details. Built together.');
  await a.press('Enter');
  await a.press('Enter');
  await a.pressSequentially(
    'The goal is simple: give our best ideas a clear direction and make the next step easy to see.',
  );
  await a.press('Enter');
  await owner.getByRole('button', { name: 'Bullet list', exact: true }).click();
  await a.pressSequentially('Agree on the creative direction');
  await a.press('Enter');
  await a.pressSequentially('Make the details feel considered');
  await a.press('Enter');
  await a.pressSequentially('Bring everyone along for the launch');
  await expect(b.locator('li')).toHaveCount(3);
  await expect(owner.getByTestId('save-status')).toHaveText('Saved to database');
  await owner.screenshot({
    path: 'docs/screenshots/editor-desktop.png',
    fullPage: true,
    caret: 'initial',
  });
  await owner.goto(`${workspaceUrl}/settings`);
  await owner.getByRole('combobox', { name: 'Role for Sam Rivera' }).selectOption('viewer');
  await owner.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(owner.getByText('Membership updated.')).toBeVisible();
  await expect(teammate.getByText('Access denied', { exact: true })).toBeVisible({ timeout: 8000 });
  await teammate.reload();
  await expect(b).toHaveAttribute('contenteditable', 'false');
  await ownerContext.close();
  await teammateContext.close();
});

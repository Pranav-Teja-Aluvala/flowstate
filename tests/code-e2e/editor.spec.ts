import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { randomBytes, createHash } from 'node:crypto';
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
import { encryptToken } from '../../packages/github/security.ts';
test('private-code browser flow with mocked GitHub and optional real Docker runner', async ({
  browser,
}) => {
  process.env.GITHUB_TOKEN_KEY = '1'.repeat(64);
  const suffix = randomBytes(5).toString('hex');
  const accounts: { id: string; name: string }[] = [];
  for (const name of ['owner', 'editor', 'viewer']) {
    const result = await pool.query(
      'INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name',
      [`Code ${name}`, `code-browser-${name}-${suffix}@test.local`, 'unused-fixture'],
    );
    accounts.push(result.rows[0]);
  }
  const contexts = [];
  let workspaceId: string | undefined;
  try {
    const workspace = (
      await pool.query('INSERT INTO workspaces(name,slug,owner_id) VALUES($1,$2,$3) RETURNING id', [
        'Code browser fixture',
        `code-browser-${suffix}`,
        accounts[0].id,
      ])
    ).rows[0];
    workspaceId = workspace.id;
    for (const [i, user] of accounts.entries())
      await pool.query('INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,$3)', [
        workspace.id,
        user.id,
        ['owner', 'editor', 'viewer'][i],
      ]);
    const project = (
      await pool.query(
        'INSERT INTO projects(workspace_id,name,created_by) VALUES($1,$2,$3) RETURNING id',
        [workspace.id, 'Shared code fixture', accounts[0].id],
      )
    ).rows[0];
    await pool.query(
      'INSERT INTO repositories(project_id,repository_id,installation_id,owner,name,default_branch,connected_by) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [project.id, '12345', '1', 'flowstate-fixture', 'repo', 'main', accounts[0].id],
    );
    const session = (
      await pool.query(
        'INSERT INTO code_sessions(project_id,branch,base_commit,created_by) VALUES($1,$2,$3,$4) RETURNING id',
        [project.id, 'main', 'a'.repeat(40), accounts[0].id],
      )
    ).rows[0];
    for (const user of accounts) {
      const token = randomBytes(32).toString('base64url');
      await pool.query('INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)', [
        user.id,
        createHash('sha256').update(token).digest('hex'),
        new Date(Date.now() + 3600_000),
      ]);
      await pool.query(
        'INSERT INTO github_accounts(user_id,github_id,login,access_token) VALUES($1,$2,$3,$4)',
        [user.id, user.id, user.name, encryptToken(`flowstate-fixture-${user.id}`)],
      );
      const context = await browser.newContext();
      await context.addCookies([
        {
          name: 'flowstate_session',
          value: token,
          url: 'http://localhost:3001',
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);
      await context.addInitScript(() => {
        const Native = window.WebSocket;
        window.WebSocket = class extends Native {
          constructor(url: string | URL, protocols?: string | string[]) {
            super(String(url).replace('localhost:1234', 'localhost:1238'), protocols);
          }
        };
      });
      contexts.push(context);
    }
    const owner = await contexts[0].newPage();
    const editor = await contexts[1].newPage();
    const viewer = await contexts[2].newPage();
    const url = `/w/${workspace.id}/p/${project.id}/code?session=${session.id}`;
    await owner.goto(url);
    await owner.getByRole('button', { name: 'New code session', exact: true }).click();
    await owner.getByRole('button', { name: 'Start session', exact: true }).click();
    await expect(owner.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => new URL(owner.url()).searchParams.get('session')).not.toBe(session.id);
    await owner.getByRole('link', { name: 'src', exact: true }).click();
    await owner.getByRole('button', { name: 'index.ts', exact: true }).click();
    await expect(owner).toHaveURL(/file=/);
    const fileUrl = owner.url();
    await editor.goto(fileUrl);
    const a = owner.getByRole('textbox', { name: 'Shared source code' });
    const b = editor.getByRole('textbox', { name: 'Shared source code' });
    await expect(a).toContainText('export const version = 1;');
    await expect(b).toContainText('export const version = 1;');
    await a.click();
    await a.press('Control+End');
    await a.press('Enter');
    await a.pressSequentially('// owner edit');
    await expect(b).toContainText('// owner edit');
    await b.click();
    await b.press('Control+End');
    await b.press('Enter');
    await b.pressSequentially('// editor edit');
    await expect(a).toContainText('// editor edit');
    await expect(owner.locator('.shared-code header [role="status"]')).toHaveText(
      'Saved to database',
    );
    await editor.reload();
    await editor.getByRole('button', { name: 'Add comment', exact: true }).click();
    await editor.getByLabel('Your comment').fill('Please review the updated entry point.');
    await editor.getByRole('button', { name: 'Post comment', exact: true }).click();
    await expect(editor.getByRole('dialog')).toHaveCount(0);
    await editor.getByRole('button', { name: 'Suggest change', exact: true }).click();
    await editor.getByLabel('Change summary').fill('Clarify the shared entry point');
    const baseline = await editor.getByLabel('Suggested code').inputValue();
    await editor.getByLabel('Suggested code').fill(baseline + '\n// reviewed suggestion');
    await editor.getByRole('button', { name: 'Send for review', exact: true }).click();
    await expect(editor.getByRole('dialog')).toHaveCount(0);
    await expect(editor.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    await owner.reload();
    await expect(
      owner.getByText('Please review the updated entry point.', { exact: true }),
    ).toBeVisible();
    // An already-rendered management form must stop working when the role is revoked.
    await pool.query("UPDATE memberships SET role='editor' WHERE workspace_id=$1 AND user_id=$2", [
      workspace.id,
      accounts[0].id,
    ]);
    await owner.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(owner.locator('.suggestion [role="alert"]')).toContainText('permission');
    await pool.query("UPDATE memberships SET role='owner' WHERE workspace_id=$1 AND user_id=$2", [
      workspace.id,
      accounts[0].id,
    ]);
    await owner.reload();
    await owner.getByRole('button', { name: 'Approve', exact: true }).click();
    const secondLeadTab = await contexts[0].newPage();
    await secondLeadTab.goto(owner.url());
    await Promise.all([
      owner.getByRole('button', { name: 'Apply approved change', exact: true }).click(),
      secondLeadTab.getByRole('button', { name: 'Apply approved change', exact: true }).click(),
    ]);
    await secondLeadTab.close();

    await expect(b).toContainText('// reviewed suggestion');
    expect(((await b.textContent()) || '').match(/reviewed suggestion/g)).toHaveLength(1);
    await expect(owner.locator('.suggestion .pill')).toHaveText('applied');
    await editor.reload();
    await editor.getByRole('button', { name: 'Suggest change', exact: true }).click();
    await editor.getByLabel('Change summary').fill('An outdated proposal');
    const old = await editor.getByLabel('Suggested code').inputValue();
    await editor.getByLabel('Suggested code').fill(old + '\n// must not overwrite newer work');
    await editor.getByRole('button', { name: 'Send for review', exact: true }).click();
    await expect(editor.getByRole('dialog')).toHaveCount(0);
    await b.click();
    await b.press('Control+End');
    await b.press('Enter');
    await b.pressSequentially('// newer team edit');
    await expect(a).toContainText('// newer team edit');
    await expect(a).toContainText('// reviewed suggestion');
    await editor.reload();
    await editor.getByRole('button', { name: 'Suggest change', exact: true }).click();
    await editor.getByLabel('Change summary').fill('A proposal to reject');
    await editor.getByLabel('Suggested code').fill('// rejected code must stay out');
    await editor.getByRole('button', { name: 'Send for review', exact: true }).click();
    await expect(editor.getByRole('dialog')).toHaveCount(0);
    await owner.reload();
    await owner
      .locator('.suggestion')
      .filter({ hasText: 'A proposal to reject' })
      .getByRole('button', { name: 'Reject', exact: true })
      .click();
    await expect(
      owner.locator('.suggestion').filter({ hasText: 'A proposal to reject' }).locator('.pill'),
    ).toHaveText('rejected');
    await expect(a).not.toContainText('rejected code must stay out');
    await owner.reload();
    await owner.getByRole('button', { name: 'Approve', exact: true }).click();
    await owner.getByRole('button', { name: 'Apply approved change', exact: true }).click();
    await expect(owner.locator('.suggestion [role="alert"]')).toContainText('changed');
    await expect(a).not.toContainText('must not overwrite');
    await expect(a).toContainText('// newer team edit');
    await owner.getByLabel('Pull request title').fill('Review shared code edits');
    await owner.getByRole('button', { name: 'Create branch & pull request', exact: true }).click();
    await expect(owner.getByRole('link', { name: /Open pull request on GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/flowstate-fixture/repo/pull/1',
    );
    await viewer.goto(fileUrl);
    await expect(viewer.getByRole('textbox', { name: 'Shared source code' })).toHaveAttribute(
      'contenteditable',
      'false',
    );
    await expect(viewer.getByRole('button', { name: 'Create branch & pull request' })).toHaveCount(
      0,
    );
    await owner.getByRole('button', { name: 'Start terminal', exact: true }).click();
    if (process.env.FLOWSTATE_LIVE_RUNNER === '1') {
      await expect(owner.locator('.terminal-panel header [role="status"]')).toHaveText('Running', {
        timeout: 30_000,
      });
      await owner.locator('.terminal-host').click();
      await owner.keyboard.type(
        "printf '// runtime edit\\n' >> src/index.ts; printf 'FLOWSTATE_RUNTIME_READY\\n'",
        { delay: 5 },
      );
      await owner.keyboard.press('Enter');
      await expect(
        owner.locator('.terminal-host').getByText('FLOWSTATE_RUNTIME_READY', { exact: true }),
      ).toBeVisible();
      await owner.getByRole('button', { name: 'Review terminal changes', exact: true }).click();
      await expect(owner.locator('.runtime-review summary')).toContainText('src/index.ts');
      await owner.getByRole('button', { name: 'Import reviewed changes', exact: true }).click();
      await expect(b).toContainText('// runtime edit');
      await owner.locator('.terminal-host').click();
      await owner.keyboard.type('flowstate push "Update the shared code"');
      await owner.keyboard.press('Enter');
      await expect(
        owner.getByRole('heading', { name: 'Confirm terminal publish request' }),
      ).toBeVisible({ timeout: 15_000 });
      await owner.getByRole('button', { name: 'Review terminal changes', exact: true }).click();
      await owner.getByRole('button', { name: 'Import reviewed changes', exact: true }).click();
      await owner
        .getByRole('button', { name: 'Confirm branch and pull request', exact: true })
        .click();
      await expect(
        owner.locator('.runtime-review').getByRole('link', { name: /Open pull request on GitHub/ }),
      ).toHaveAttribute('href', 'https://github.com/flowstate-fixture/repo/pull/1');
      await owner.getByRole('button', { name: 'Stop workspace', exact: true }).click();
    } else {
      await expect(owner.locator('.terminal-panel .feedback.error')).toContainText(
        'Terminal unavailable',
      );
    }
    await owner.screenshot({
      path: '.local/code-editor-fixture.png',
      fullPage: true,
      caret: 'initial',
    });
  } finally {
    for (const context of contexts) await context.close();
    if (workspaceId) await pool.query('DELETE FROM workspaces WHERE id=$1', [workspaceId]);
    for (const user of accounts) await pool.query('DELETE FROM users WHERE id=$1', [user.id]);
    await pool.end();
  }
});

import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { randomBytes, createHash } from 'node:crypto';
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
import { encryptToken } from '../../packages/github/security.ts';
test('private-code browser flow with mocked GitHub: shared edits, saved PR snapshot, viewer and unavailable runner', async ({
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
    await expect(owner.locator('.terminal-panel .feedback.error')).toContainText(
      'Terminal unavailable',
    );
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

import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
test('a public repository connects by URL without GitHub credentials and supports shared editing and download', async ({
  browser,
}) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const users = [randomUUID(), randomUUID(), randomUUID(), randomUUID()],
    workspace = randomUUID(),
    project = randomUUID();
  const contexts = [];
  try {
    for (const [index, id] of users.entries()) {
      const token = randomUUID();
      await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)', [
        id,
        `Public code member ${index}`,
        `${id}@public-code.test`,
        'unused',
      ]);
      await pool.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
        [createHash('sha256').update(token).digest('hex'), id],
      );
      const context = await browser.newContext();
      await context.addCookies([
        { name: 'flowstate_session', value: token, url: 'http://localhost:3001' },
      ]);
      await context.addInitScript(() => {
        const Original = window.WebSocket;
        window.WebSocket = class extends Original {
          constructor(url: string | URL, protocols?: string | string[]) {
            super(String(url).replace('localhost:1234', 'localhost:1238'), protocols);
          }
        };
      });
      contexts.push(context);
    }
    await pool.query('INSERT INTO workspaces(id,name,slug,owner_id) VALUES($1,$2,$3,$4)', [
      workspace,
      'Public repository test',
      `public-code-${workspace}`,
      users[0],
    ]);
    await pool.query(
      "INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'editor'),($1,$4,'viewer')",
      [workspace, ...users.slice(0, 3)],
    );
    await pool.query('INSERT INTO projects(id,workspace_id,name,created_by) VALUES($1,$2,$3,$4)', [
      project,
      workspace,
      'Public code workspace',
      users[0],
    ]);
    const a = await contexts[0].newPage(),
      b = await contexts[1].newPage(),
      viewer = await contexts[2].newPage();
    const base = `/w/${workspace}/p/${project}/code`;
    await a.goto(base);
    await a
      .getByLabel('Public GitHub repository URL')
      .fill('https://github.com/flowstate-fixture/public-repo');
    await a.getByRole('button', { name: 'Connect public repository', exact: true }).click();
    await expect(a.getByText(/Public repository connected · shared-copy editing/)).toBeVisible();
    await a.getByRole('button', { name: 'New code session', exact: true }).click();
    await a.getByRole('button', { name: 'Start session', exact: true }).click();
    await a.getByRole('link', { name: 'src', exact: true }).click();
    await a.getByRole('button', { name: 'index.ts', exact: true }).click();
    await expect(a.getByRole('textbox', { name: 'Shared source code' })).toContainText(
      'export const version = 1;',
    );
    await b.goto(a.url());
    const first = a.getByRole('textbox', { name: 'Shared source code' }),
      second = b.getByRole('textbox', { name: 'Shared source code' });
    await expect(second).toContainText('export const version = 1;');
    await first.click();
    await first.press('Control+End');
    await first.press('Enter');
    await first.pressSequentially('// public shared edit');
    await expect(second).toContainText('// public shared edit');
    await expect(a.locator('.shared-code header [role="status"]')).toHaveText('Saved to database');
    await expect(
      a.getByRole('button', { name: 'Create branch & pull request', exact: true }),
    ).toHaveCount(0);
    await viewer.goto(a.url());
    await expect(viewer.getByRole('textbox', { name: 'Shared source code' })).toHaveAttribute(
      'contenteditable',
      'false',
    );
    const download = a.getByRole('link', { name: 'Download saved file', exact: true });
    const path = (await download.getAttribute('href'))!;
    expect(await (await a.request.get(path)).text()).toContain('// public shared edit');
    expect((await contexts[3].request.get(path)).status()).toBe(403);
    expect(
      (await pool.query('SELECT * FROM github_accounts WHERE user_id=ANY($1::uuid[])', [users]))
        .rowCount,
    ).toBe(0);
    await a.screenshot({ path: '.local/public-code-browser.png', fullPage: true });
  } finally {
    for (const context of contexts) await context.close();
    await pool.query('DELETE FROM workspaces WHERE id=$1', [workspace]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [users]);
    await pool.end();
  }
});

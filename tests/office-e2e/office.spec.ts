import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { Pool } from 'pg';
import { signOfficeToken, verifyOfficeToken } from '../../apps/web/src/lib/office-policy';
const secret = 'office_browser_fixture_secret_at_least_32_characters';
const changed = Buffer.from('%PDF-1.4\nEdited office transport fixture.\n');
test('office contract: permissions, signed source, durable save, history and revocation', async ({
  page,
  browser,
}) => {
  const server = createServer((request, response) => {
    if (request.url === '/web-apps/apps/api/documents/api.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(
        'window.DocsAPI={DocEditor:class{constructor(id,config){this.element=document.getElementById(id);this.element.textContent="Office transport fixture (not a real editor)";config.events.onDocumentReady();}destroyEditor(){this.element.textContent=""}}}',
      );
    } else if (request.url?.startsWith('/cache/files/')) response.end(changed);
    else {
      response.statusCode = 404;
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(1240, '127.0.0.1', resolve));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const ownerId = randomUUID(),
    viewerId = randomUUID(),
    outsiderId = randomUUID(),
    workspaceId = randomUUID(),
    projectId = randomUUID();
  const tokens = [randomUUID(), randomUUID(), randomUUID()];
  const viewer = await browser.newContext(),
    outsider = await browser.newContext();
  const base = 'http://localhost:3002';
  const original = Buffer.from('%PDF-1.4\nOriginal upload fixture.\n');
  const hash = (token: string) => createHash('sha256').update(token).digest('hex');
  try {
    for (const [index, id] of [ownerId, viewerId, outsiderId].entries()) {
      await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)', [
        id,
        `Office fixture ${index}`,
        `${id}@test.local`,
        'unused',
      ]);
      await pool.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
        [hash(tokens[index]), id],
      );
    }
    await pool.query('INSERT INTO workspaces(id,name,slug,owner_id) VALUES($1,$2,$3,$4)', [
      workspaceId,
      'Office integration',
      `office-${workspaceId}`,
      ownerId,
    ]);
    await pool.query(
      "INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'viewer')",
      [workspaceId, ownerId, viewerId],
    );
    await pool.query('INSERT INTO projects(id,workspace_id,name,created_by) VALUES($1,$2,$3,$4)', [
      projectId,
      workspaceId,
      'Office fixtures',
      ownerId,
    ]);
    await page.context().addCookies([{ name: 'flowstate_session', value: tokens[0], url: base }]);
    await viewer.addCookies([{ name: 'flowstate_session', value: tokens[1], url: base }]);
    await outsider.addCookies([{ name: 'flowstate_session', value: tokens[2], url: base }]);
    const upload = await page.request.post(`/api/v1/projects/${projectId}/files`, {
      headers: { origin: base, 'x-file-name': 'brief.pdf' },
      data: original,
    });
    expect(upload.status()).toBe(201);
    const { id: fileId } = await upload.json();
    const endpoint = `${base}/api/v1/files/${fileId}/office`;
    const configuration = await (await page.request.get(endpoint)).json();
    expect(configuration.config.document.permissions.edit).toBe(true);
    expect(verifyOfficeToken(configuration.config.token, secret).document).toEqual(
      configuration.config.document,
    );
    const key = configuration.config.document.key,
      sourceURL = configuration.config.document.url;
    const anon = await browser.newContext();
    try {
      expect(await (await anon.request.get(sourceURL)).body()).toEqual(original);
    } finally {
      await anon.close();
    }
    const viewerConfig = await (await viewer.request.get(endpoint)).json();
    expect(viewerConfig.config.document.permissions.edit).toBe(false);
    expect((await outsider.request.get(endpoint)).status()).toBe(404);
    await page.goto(`/w/${workspaceId}/p/${projectId}/files/${fileId}`);
    await expect(
      page.getByText('Office transport fixture (not a real editor)', { exact: true }),
    ).toBeVisible();
    const callback = `${endpoint}/callback`;
    const payload = {
      key,
      status: 2,
      url: 'http://127.0.0.1:1240/cache/files/fixture/output.pdf',
      filetype: 'pdf',
      users: [ownerId],
    };
    const signed = (value: Record<string, unknown>) => ({
      headers: {
        Authorization: `Bearer ${signOfficeToken({ operation: 'callback', payload: value }, secret)}`,
      },
      data: { key: 'ignored_unsigned_key', url: 'https://malicious.example/ignored' },
    });
    expect(
      (
        await page.request.post(callback, {
          headers: { Authorization: `Bearer ${configuration.config.token}` },
          data: payload,
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.post(
          callback,
          signed({ ...payload, url: 'http://169.254.169.254/cache/files/metadata' }),
        )
      ).status(),
    ).toBe(403);
    expect(
      (await page.request.post(callback, signed({ ...payload, users: [viewerId] }))).status(),
    ).toBe(403);
    expect((await page.request.post(callback, signed(payload))).status()).toBe(200);
    expect(await (await page.request.get(`/api/v1/files/${fileId}`)).body()).toEqual(changed);
    const { rows } = await pool.query(
      'SELECT id,version FROM project_file_versions WHERE file_id=$1',
      [fileId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].version).toBe(1);
    expect(
      await (
        await viewer.request.get(`${base}/api/v1/files/${fileId}?version=${rows[0].id}`)
      ).body(),
    ).toEqual(original);
    expect((await page.request.post(callback, signed(payload))).status()).toBe(200);
    const current = await (await page.request.get(endpoint)).json();
    expect(current.version).toBe(2);
    expect(current.config.document.key).not.toBe(key);
    expect((await page.request.get(sourceURL)).status()).toBe(403);
    await pool.query('DELETE FROM memberships WHERE workspace_id=$1 AND user_id=$2', [
      workspaceId,
      viewerId,
    ]);
    expect((await viewer.request.get(endpoint)).status()).toBe(404);
    expect((await viewer.request.get(viewerConfig.config.document.url)).status()).toBe(403);
    await pool.query("UPDATE memberships SET role='viewer' WHERE workspace_id=$1 AND user_id=$2", [
      workspaceId,
      ownerId,
    ]);
    await expect(page.getByRole('alert').filter({ hasText: 'editing role changed' })).toBeVisible();
    expect(
      (
        await page.request.post(callback, signed({ ...payload, key: current.config.document.key }))
      ).status(),
    ).toBe(403);
  } finally {
    await viewer.close();
    await outsider.close();
    await pool.query('DELETE FROM workspaces WHERE id=$1', [workspaceId]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [
      [ownerId, viewerId, outsiderId],
    ]);
    await pool.end();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

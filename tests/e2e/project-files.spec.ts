import { test, expect } from '@playwright/test';
import 'dotenv/config';
import { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
test('project files preserve bytes and enforce workspace roles, origin and membership', async ({
  page,
  browser,
}) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const ownerId = randomUUID(),
    viewerId = randomUUID(),
    outsiderId = randomUUID();
  const workspaceId = randomUUID(),
    projectId = randomUUID();
  const ownerToken = randomUUID(),
    viewerToken = randomUUID(),
    outsiderToken = randomUUID();
  const viewer = await browser.newContext(),
    outsider = await browser.newContext();
  const hash = (token: string) => createHash('sha256').update(token).digest('hex');
  const base = 'http://localhost:3000';
  try {
    for (const [id, name, token] of [
      [ownerId, 'File owner', ownerToken],
      [viewerId, 'File viewer', viewerToken],
      [outsiderId, 'File outsider', outsiderToken],
    ]) {
      await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)', [
        id,
        name,
        `${id}@test.local`,
        'unused',
      ]);
      await pool.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
        [hash(token), id],
      );
    }
    await pool.query('INSERT INTO workspaces(id,name,slug,owner_id) VALUES($1,$2,$3,$4)', [
      workspaceId,
      'File test',
      `files-${workspaceId}`,
      ownerId,
    ]);
    await pool.query(
      "INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'viewer')",
      [workspaceId, ownerId, viewerId],
    );
    await pool.query('INSERT INTO projects(id,workspace_id,name,created_by) VALUES($1,$2,$3,$4)', [
      projectId,
      workspaceId,
      'Shared files',
      ownerId,
    ]);
    await page.context().addCookies([{ name: 'flowstate_session', value: ownerToken, url: base }]);
    await viewer.addCookies([{ name: 'flowstate_session', value: viewerToken, url: base }]);
    await outsider.addCookies([{ name: 'flowstate_session', value: outsiderToken, url: base }]);
    const filesPath = `/w/${workspaceId}/p/${projectId}/files`;
    await page.goto(filesPath);
    const body = Buffer.from('Shared brief: preserve these bytes.\n');
    await page
      .getByLabel('Add a project file')
      .setInputFiles({ name: 'team-brief.txt', mimeType: 'text/plain', buffer: body });
    await page.getByRole('button', { name: 'Upload file', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('File uploaded.');
    const link = page.getByRole('link', { name: 'team-brief.txt', exact: true });
    await expect(link).toBeVisible();
    if (process.env.CAPTURE_SCREENSHOTS === '1') {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: 'docs/screenshots/project-files-desktop.png', fullPage: true });
    }
    const downloadPath = (await link.getAttribute('href'))!;
    const downloaded = await page.request.get(downloadPath);
    expect(downloaded.status()).toBe(200);
    expect(await downloaded.body()).toEqual(body);
    expect(downloaded.headers()['content-disposition']).toContain('attachment');
    expect(downloaded.headers()['cache-control']).toContain('no-store');
    expect((await viewer.request.get(`${base}${downloadPath}`)).status()).toBe(200);
    expect((await outsider.request.get(`${base}${downloadPath}`)).status()).toBe(404);
    const uploadPath = `${base}/api/v1/projects/${projectId}/files`;
    const options = { headers: { origin: base, 'x-file-name': 'attempt.txt' }, data: body };
    expect((await viewer.request.post(uploadPath, options)).status()).toBe(403);
    expect((await outsider.request.post(uploadPath, options)).status()).toBe(403);
    expect(
      (
        await page.request.post(uploadPath, {
          ...options,
          headers: { ...options.headers, origin: 'https://other.example' },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post(uploadPath, {
          ...options,
          headers: { ...options.headers, 'x-file-name': 'fake.pdf' },
        })
      ).status(),
    ).toBe(400);
    await pool.query('DELETE FROM memberships WHERE workspace_id=$1 AND user_id=$2', [
      workspaceId,
      viewerId,
    ]);
    expect((await viewer.request.get(`${base}${downloadPath}`)).status()).toBe(404);
    const quotaId = randomUUID();
    await pool.query(
      'INSERT INTO project_files(id,project_id,name,mime_type,size,storage_key,storage_provider,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        quotaId,
        projectId,
        'quota-fixture.txt',
        'text/plain',
        100 * 1024 * 1024 - body.length,
        `${projectId}/${quotaId}`,
        'local',
        ownerId,
      ],
    );
    expect((await page.request.post(uploadPath, options)).status()).toBe(413);
  } finally {
    await viewer.close();
    await outsider.close();
    await pool.query('DELETE FROM workspaces WHERE id=$1', [workspaceId]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [
      [ownerId, viewerId, outsiderId],
    ]);
    await pool.end();
  }
});

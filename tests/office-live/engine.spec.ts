import 'dotenv/config';
import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
test('real office engine opens all four formats and saves edits from two Word collaborators', async ({
  page,
  browser,
}) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const owner = randomUUID(),
    editor = randomUUID(),
    workspace = randomUUID(),
    project = randomUUID();
  const tokens = [randomUUID(), randomUUID()];
  const editorContext = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const teammate = await editorContext.newPage();
  const base = 'http://localhost:3003';
  const open = async (target: Page, fileId: string) => {
    await target.goto(`/w/${workspace}/p/${project}/files/${fileId}`);
    await expect(target.getByRole('status')).toContainText('Connected.', { timeout: 60_000 });
    await expect(target.locator('.office-frame iframe')).toBeVisible();
  };
  try {
    for (const [index, id] of [owner, editor].entries()) {
      await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)', [
        id,
        index ? 'Real engine teammate' : 'Real engine owner',
        `${id}@test.local`,
        'unused',
      ]);
      await pool.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
        [createHash('sha256').update(tokens[index]).digest('hex'), id],
      );
    }
    await pool.query('INSERT INTO workspaces(id,name,slug,owner_id) VALUES($1,$2,$3,$4)', [
      workspace,
      'Real Office verification',
      `real-office-${workspace}`,
      owner,
    ]);
    await pool.query(
      "INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'editor')",
      [workspace, owner, editor],
    );
    await pool.query('INSERT INTO projects(id,workspace_id,name,created_by) VALUES($1,$2,$3,$4)', [
      project,
      workspace,
      'Synthetic Office fixtures',
      owner,
    ]);
    await page.context().addCookies([{ name: 'flowstate_session', value: tokens[0], url: base }]);
    await editorContext.addCookies([{ name: 'flowstate_session', value: tokens[1], url: base }]);
    const files = new Map<string, string>();
    for (const name of ['brief.docx', 'sheet.xlsx', 'slides.pptx', 'brief.pdf']) {
      const response = await page.request.post(`/api/v1/projects/${project}/files`, {
        headers: { origin: base, 'x-file-name': name },
        data: await readFile(`.local/office-fixtures/${name}`),
      });
      expect(response.status()).toBe(201);
      files.set(name, (await response.json()).id);
    }
    const word = files.get('brief.docx')!;
    await open(page, word);
    await open(teammate, word);
    for (const [target, text] of [
      [page, 'FLOWSTATE_OWNER_EDIT'],
      [teammate, 'FLOWSTATE_TEAM_EDIT'],
    ] as const) {
      await target
        .frameLocator('.office-frame iframe')
        .locator('#editor_sdk')
        .click({ position: { x: 300, y: 220 } });
      await target.keyboard.press('Control+End');
      await target.keyboard.press('Enter');
      await target.keyboard.type(text, { delay: 15 });
    }
    await page.goto(`/w/${workspace}/p/${project}/files`);
    await teammate.goto(`/w/${workspace}/p/${project}/files`);
    await expect
      .poll(
        async () =>
          Number(
            (await pool.query('SELECT version FROM project_files WHERE id=$1', [word])).rows[0]
              .version,
          ),
        { timeout: 60_000, intervals: [1000, 2000] },
      )
      .toBeGreaterThan(1);
    const result = await page.request.get(`/api/v1/files/${word}`);
    expect(result.status()).toBe(200);
    const filename = '.local/office-fixtures/edited-result.docx';
    await writeFile(filename, await result.body());
    const text = execFileSync(
      process.env.OFFICE_TEST_PYTHON || 'python',
      [
        '-c',
        'from docx import Document; import sys; print("\\n".join(p.text for p in Document(sys.argv[1]).paragraphs))',
        filename,
      ],
      { encoding: 'utf8' },
    );
    expect(text).toContain('FLOWSTATE_OWNER_EDIT');
    expect(text).toContain('FLOWSTATE_TEAM_EDIT');
    for (const name of ['sheet.xlsx', 'slides.pptx', 'brief.pdf']) {
      await open(page, files.get(name)!);
      await page.goto(`/w/${workspace}/p/${project}/files`);
    }
  } finally {
    await editorContext.close();
    await pool.query('DELETE FROM workspaces WHERE id=$1', [workspace]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[owner, editor]]);
    await pool.end();
  }
});

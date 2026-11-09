import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import JSZip from 'jszip';
import { mkdir, writeFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import AxeBuilder from '@axe-core/playwright';
test('native Word, Excel, PowerPoint and PDF creation, shared edits, real exports and permissions', async ({
  browser,
}) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const owner = randomUUID(),
    editor = randomUUID(),
    viewer = randomUUID(),
    outsider = randomUUID(),
    workspace = randomUUID(),
    project = randomUUID();
  const contexts = [];
  try {
    for (const [index, id] of [owner, editor, viewer, outsider].entries()) {
      const token = randomUUID();
      await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)', [
        id,
        ['Alex Morgan', 'Sam Rivera', 'Taylor Lee', 'Unrelated user'][index],
        `${id}@native.test`,
        'unused',
      ]);
      await pool.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
        [createHash('sha256').update(token).digest('hex'), id],
      );
      const context = await browser.newContext();
      await context.addCookies([
        { name: 'flowstate_session', value: token, url: 'http://localhost:3000' },
      ]);
      contexts.push(context);
    }
    await pool.query('INSERT INTO workspaces(id,name,slug,owner_id) VALUES($1,$2,$3,$4)', [
      workspace,
      'Northstar Studio',
      `native-${workspace}`,
      owner,
    ]);
    await pool.query(
      "INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'editor'),($1,$4,'viewer')",
      [workspace, owner, editor, viewer],
    );
    await pool.query('INSERT INTO projects(id,workspace_id,name,created_by) VALUES($1,$2,$3,$4)', [
      project,
      workspace,
      'Studio launch',
      owner,
    ]);
    const a = await contexts[0].newPage(),
      b = await contexts[1].newPage();
    const base = `/w/${workspace}/p/${project}`;
    const create = async (type: string, title: string) => {
      await a.goto(base);
      await a.getByRole('button', { name: 'New document', exact: true }).click();
      if (type === 'Word')
        await a.screenshot({ path: 'docs/screenshots/create-document.png', fullPage: true });
      await a.getByRole('button', { name: `Create ${type}`, exact: true }).click();
      await a.getByLabel('Document title', { exact: true }).fill(title);
      await a.getByRole('button', { name: 'Create document', exact: true }).click();
      await expect(a).toHaveURL(/\/d\/[a-f0-9-]+$/);
      await expect(a.getByRole('heading', { name: title, exact: true })).toBeVisible();
      return new URL(a.url()).pathname.split('/').pop()!;
    };
    const word = await create('Word', 'The launch brief');
    const wordUrl = a.url();
    await b.goto(wordUrl);
    await a
      .getByRole('textbox', { name: 'Document content' })
      .fill('A shared direction for the next chapter.');
    await expect(b.getByRole('textbox', { name: 'Document content' })).toContainText(
      'A shared direction',
    );
    await expect(a.getByTestId('save-status')).toHaveText('Saved to database');
    const wordResult = await a.request.get(`/api/v1/documents/${word}/export?format=docx`);
    expect(wordResult.status()).toBe(200);
    await mkdir('.local', { recursive: true });
    await writeFile('.local/native-created.docx', await wordResult.body());
    const wordZip = await JSZip.loadAsync(await wordResult.body());
    expect(await wordZip.file('word/document.xml')!.async('string')).toContain(
      'A shared direction for the next chapter.',
    );
    expect(
      (await contexts[2].request.get(`/api/v1/documents/${word}/export?format=docx`)).status(),
    ).toBe(200);
    expect(
      (await contexts[3].request.get(`/api/v1/documents/${word}/export?format=docx`)).status(),
    ).toBe(404);
    const sheet = await create('Excel', 'Launch budget');
    const sheetUrl = a.url();
    await b.goto(sheetUrl);
    await a.getByLabel('Cell A1', { exact: true }).fill('12');
    await a.getByLabel('Cell B1', { exact: true }).fill('18');
    await a.getByLabel('Cell C1', { exact: true }).fill('=SUM(A1:B1)');
    await a.getByLabel('Cell D1', { exact: true }).click();
    await expect(b.getByLabel('Cell C1', { exact: true })).toHaveValue('30');
    await b.getByLabel('Cell A2', { exact: true }).fill('Built together');
    await expect(a.getByLabel('Cell A2', { exact: true })).toHaveValue('Built together');
    await expect(a.getByTestId('save-status')).toHaveText('Saved to database');
    await a.reload();
    await expect(a.getByLabel('Cell C1', { exact: true })).toHaveValue('30');
    const excel = await a.request.get(`/api/v1/documents/${sheet}/export?format=xlsx`);
    expect(excel.status()).toBe(200);
    await writeFile('.local/native-created.xlsx', await excel.body());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await excel.body());
    expect(workbook.worksheets[0].getCell('A1').value).toBe(12);
    expect(workbook.worksheets[0].getCell('A2').value).toBe('Built together');
    expect(workbook.worksheets[0].getCell('C1').value).toEqual({
      formula: 'SUM(A1:B1)',
      result: 30,
    });
    expect((await a.request.get(`/api/v1/documents/${sheet}/export?format=docx`)).status()).toBe(
      400,
    );
    const readonly = await contexts[2].newPage();
    await readonly.goto(sheetUrl);
    await expect(readonly.getByLabel('Cell A1', { exact: true })).toHaveAttribute('readonly', '');
    await a.getByLabel('Cell H20', { exact: true }).evaluate((input) => {
      const clipboard = new DataTransfer();
      clipboard.setData('text/plain', 'One\tTwo\nThree\tFour');
      input.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }),
      );
    });
    await expect(a.getByLabel('Cell I21', { exact: true })).toHaveValue('Four');
    await expect(b.getByLabel('Cell H20', { exact: true })).toHaveValue('One');
    await a.locator('.sheet-grid-wrap').evaluate((node) => {
      node.scrollTop = 0;
      node.scrollLeft = 0;
    });
    await a.setViewportSize({ width: 390, height: 844 });
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
      true,
    );
    await a.setViewportSize({ width: 1280, height: 900 });
    await a.screenshot({ path: 'docs/screenshots/spreadsheet-desktop.png', fullPage: true });
    const slides = await create('PowerPoint', 'Our next chapter');
    const slideUrl = a.url();
    await b.goto(slideUrl);
    await a.getByLabel('Slide title', { exact: true }).fill('A shared direction');
    await a
      .getByLabel('Slide content', { exact: true })
      .fill('Build the idea.\nReview the details.\nShip it together.');
    await expect(b.getByLabel('Slide title', { exact: true })).toHaveValue('A shared direction');
    await a.getByRole('button', { name: 'Add slide', exact: true }).click();
    await a.getByLabel('Slide title', { exact: true }).fill('Ready for what’s next');
    await expect(a.getByTestId('save-status')).toHaveText('Saved to database');
    const deck = await a.request.get(`/api/v1/documents/${slides}/export?format=pptx`);
    expect(deck.status()).toBe(200);
    await writeFile('.local/native-created.pptx', await deck.body());
    const deckZip = await JSZip.loadAsync(await deck.body());
    expect(await deckZip.file('ppt/slides/slide1.xml')!.async('string')).toContain(
      'A shared direction',
    );
    expect(await deckZip.file('ppt/slides/slide2.xml')!.async('string')).toContain(
      'Ready for what',
    );
    await a
      .locator('.slide-thumbnails')
      .getByRole('button')
      .filter({ hasText: 'A shared direction' })
      .click();
    await a.locator('.slide-controls').click();
    const dismiss = a.getByRole('button', { name: 'Dismiss notification', exact: true });
    if (await dismiss.count()) await dismiss.click();
    await a.screenshot({ path: 'docs/screenshots/presentation-desktop.png', fullPage: true });
    const pdf = await create('PDF', 'A finished thought');
    expect(pdf).toMatch(/[a-f0-9-]{36}/);
    await a
      .getByRole('textbox', { name: 'Document content' })
      .fill('A document we created together, ready to share.');
    await expect(a.getByTestId('save-status')).toHaveText('Saved to database');
    await a.emulateMedia({ media: 'print' });
    const output = await a.pdf({ path: '.local/native-created.pdf', preferCSSPageSize: true });
    expect(output.subarray(0, 5).toString()).toBe('%PDF-');
    await a.emulateMedia({ media: 'screen' });
    expect(
      (await new AxeBuilder({ page: a }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await pool.query('DELETE FROM memberships WHERE workspace_id=$1 AND user_id=$2', [
      workspace,
      viewer,
    ]);
    expect(
      (await contexts[2].request.get(`/api/v1/documents/${word}/export?format=docx`)).status(),
    ).toBe(404);
  } finally {
    for (const context of contexts) await context.close();
    await pool.query('DELETE FROM workspaces WHERE id=$1', [workspace]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [
      [owner, editor, viewer, outsider],
    ]);
    await pool.end();
  }
});

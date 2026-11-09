import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import AxeBuilder from '@axe-core/playwright';
const origin = new URL(process.env.AUDIT_URL || 'http://localhost:3004').origin;
let service;
if (process.argv.includes('--start')) {
  const url = new URL(origin);
  if (!['localhost', '127.0.0.1'].includes(url.hostname))
    throw new Error('--start requires a local audit origin.');
  service = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', 'apps/web', '-p', url.port || '3004'],
    { stdio: 'ignore', windowsHide: true },
  );
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (service.exitCode !== null)
      throw new Error('Audit server could not start. Check that its port is free.');
    try {
      if ((await fetch(origin + '/about')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) {
    service.kill();
    throw new Error('Audit server did not become ready.');
  }
}
const port = await new Promise((resolve) => {
  const server = createServer().listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});
const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
await mkdir('.local/audits', { recursive: true });
let failed = false;
try {
  for (const path of ['/about', '/privacy', '/terms']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(origin + path);
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    await writeFile(
      `.local/audits/${path.slice(1)}-accessibility.json`,
      JSON.stringify(axe, null, 2),
    );
    const result = await lighthouse(origin + path, {
      port,
      output: ['json', 'html'],
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      formFactor: 'desktop',
      screenEmulation: {
        mobile: false,
        width: 1280,
        height: 900,
        deviceScaleFactor: 1,
        disabled: false,
      },
      logLevel: 'error',
    });
    await writeFile(`.local/audits/${path.slice(1)}-lighthouse.json`, result.report[0]);
    await writeFile(`.local/audits/${path.slice(1)}-lighthouse.html`, result.report[1]);
    const scores = Object.fromEntries(
      Object.entries(result.lhr.categories).map(([key, value]) => [
        key,
        Math.round(value.score * 100),
      ]),
    );
    console.log(path, JSON.stringify(scores), `WCAG violations: ${axe.violations.length}`);
    for (const violation of axe.violations)
      console.log(
        '  accessibility:',
        violation.id,
        violation.nodes.map((node) => node.target.join(' ')).join(', '),
      );
    for (const audit of Object.values(result.lhr.audits))
      if (
        audit.score !== null &&
        audit.score < 1 &&
        ['binary', 'numeric'].includes(audit.scoreDisplayMode)
      )
        console.log(' ', audit.id, audit.title);
    if (
      axe.violations.length ||
      scores.seo < 100 ||
      scores.accessibility < 100 ||
      scores['best-practices'] < 100
    )
      failed = true;
    await context.close();
  }
} finally {
  await browser.close();
  service?.kill();
}
if (failed) process.exitCode = 1;

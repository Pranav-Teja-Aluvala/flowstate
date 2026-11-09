import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('public pages are accessible, responsive and indexable while workspace routes stay private', async ({
  page,
  request,
}) => {
  for (const path of ['/', '/privacy', '/terms']) {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S.{30,}/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `http://localhost:3000${path === '/' ? '' : path}`,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    if (path === '/')
      await page.screenshot({ path: 'docs/screenshots/about-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  await page.goto('/');
  await expect(page.locator('main h1')).toContainText('Good ideas deserve');
  await page.screenshot({ path: 'docs/screenshots/about-desktop.png', fullPage: true });
  await page.screenshot({ path: '.local/landing-preview.png', fullPage: false });
  await page.goto('/login');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('http://localhost:3000/');
  expect(sitemap).not.toContain('/w/');
  expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /api/');
});

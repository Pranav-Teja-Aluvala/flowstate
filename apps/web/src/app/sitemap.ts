import type { MetadataRoute } from 'next';
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = new URL(process.env.APP_URL || 'http://localhost:3000').origin;
  return ['/about', '/privacy', '/terms'].map((path) => ({ url: origin + path }));
}

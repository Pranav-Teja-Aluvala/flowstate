import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app', '/w/', '/api/', '/join/', '/login'],
    },
    sitemap: `${new URL(process.env.APP_URL || 'http://localhost:3000').origin}/sitemap.xml`,
  };
}

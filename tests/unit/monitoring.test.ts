import { expect, it } from 'vitest';
import { sanitizeMonitoringEvent } from '../../apps/web/src/lib/monitoring';
it('omits document text, requests, cookies, SQL messages and breadcrumbs from monitoring events', () => {
  const result = sanitizeMonitoringEvent({
    type: undefined,
    event_id: 'fixture',
    message: 'PRIVATE_DOCUMENT',
    user: { email: 'private@example.test' },
    request: {
      url: 'https://example.test/?token=PRIVATE_TOKEN',
      headers: { cookie: 'PRIVATE_COOKIE' },
    },
    extra: { document: 'PRIVATE_BODY' },
    tags: { sql: 'PRIVATE_SQL' },
    breadcrumbs: [{ message: 'PRIVATE_BREADCRUMB' }],
    exception: {
      values: [
        {
          type: 'Error',
          value: 'PRIVATE_DATABASE_QUERY',
          stacktrace: {
            frames: [
              {
                filename: 'https://example.test/app.js?secret=PRIVATE_SECRET',
                lineno: 42,
                function: 'save',
                context_line: 'PRIVATE_SOURCE',
              },
            ],
          },
        },
      ],
    },
  });
  expect(JSON.stringify(result)).not.toContain('PRIVATE_');
  expect(result.exception?.values?.[0].stacktrace?.frames?.[0].lineno).toBe(42);
});

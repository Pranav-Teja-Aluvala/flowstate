import { sanitizeMonitoringEvent, monitoringDataCollection } from './lib/monitoring';
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import('@sentry/nextjs').then((Sentry) =>
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      dataCollection: monitoringDataCollection,
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      beforeSendLog: () => null,
      beforeSend: sanitizeMonitoringEvent,
    }),
  );
}

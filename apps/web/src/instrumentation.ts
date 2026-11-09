import type { Instrumentation } from 'next';
import { sanitizeMonitoringEvent, monitoringDataCollection } from './lib/monitoring';
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SENTRY_DSN) {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      dataCollection: monitoringDataCollection,
      defaultIntegrations: false,
      tracesSampleRate: 0,
      beforeSendLog: () => null,
      beforeSend: sanitizeMonitoringEvent,
    });
  }
}
export const onRequestError: Instrumentation.onRequestError = async (error) => {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SENTRY_DSN) {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureException(error);
    await Sentry.flush(1500);
  }
};

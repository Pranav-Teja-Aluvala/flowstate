'use client';
import { useEffect } from 'react';
export default function Error({
  error,
  reset,
}: {
  error: globalThis.Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN)
      void import('@sentry/nextjs').then((Sentry) => Sentry.captureException(error));
  }, [error]);
  return (
    <main className="fallback">
      <p className="eyebrow">A SMALL INTERRUPTION</p>
      <h1>We couldn’t load this space.</h1>
      <p>Please try again. If this continues, check the database connection.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}

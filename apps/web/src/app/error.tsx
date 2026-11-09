'use client';
export default function Error({ reset }: { reset: () => void }) {
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

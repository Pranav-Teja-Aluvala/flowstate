import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="fallback">
      <p className="eyebrow">NOT IN THIS SPACE</p>
      <h1>This page isn’t available.</h1>
      <p>It may have moved, or you may need workspace access.</p>
      <Link className="button primary" href="/">
        Back to your workspaces
      </Link>
    </main>
  );
}

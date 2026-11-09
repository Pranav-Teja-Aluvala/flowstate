import Link from 'next/link';
export function PublicFooter() {
  return (
    <footer className="public-footer">
      <span>FLOWSTATE / Creative collaboration studio</span>
      <nav aria-label="Legal">
        <Link href="/about">About</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </nav>
    </footer>
  );
}

'use client';
export function DocumentExport() {
  return (
    <button className="button secondary" type="button" onClick={() => window.print()}>
      Export PDF / print
    </button>
  );
}

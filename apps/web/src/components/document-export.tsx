'use client';
export function DocumentExport({ title = 'FLOWSTATE document' }: { title?: string }) {
  return (
    <button
      className="button secondary"
      type="button"
      onClick={() => {
        const previous = document.title;
        document.title = title;
        try {
          window.print();
        } finally {
          document.title = previous;
        }
      }}
    >
      Export PDF / print
    </button>
  );
}

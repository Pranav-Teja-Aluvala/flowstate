'use client';
import { useState } from 'react';
export function FileExport({ fileId, name }: { fileId: string; name: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function download() {
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/api/v1/files/${fileId}/export`, { method: 'POST' });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'PDF export is unavailable.');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = name.replace(/\.[^.]+$/, '') + '.pdf';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'PDF export is unavailable.');
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <button
        className="button secondary"
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={download}
      >
        {pending ? 'Preparing PDF…' : 'Export saved file as PDF'}
      </button>
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

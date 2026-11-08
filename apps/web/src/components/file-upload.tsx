'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MAX_FILE_BYTES } from '@/lib/file-policy';
export function FileUpload({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  return (
    <form
      className="settings-card form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const file = input.current?.files?.[0];
        setError('');
        setMessage('');
        if (!file) {
          setError('Choose a file first.');
          return;
        }
        if (file.size > MAX_FILE_BYTES) {
          setError('Files must be 4 MiB or smaller.');
          return;
        }
        setBusy(true);
        try {
          const response = await fetch(`/api/v1/projects/${projectId}/files`, {
            method: 'POST',
            headers: {
              'x-file-name': encodeURIComponent(file.name),
              'Content-Type': 'application/octet-stream',
            },
            body: file,
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Upload failed.');
          if (input.current) input.current.value = '';
          setMessage('File uploaded.');
          router.refresh();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Upload failed. Please retry.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="project-file">Add a project file</label>
      <input
        ref={input}
        id="project-file"
        type="file"
        accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv"
        disabled={busy}
      />
      <p className="muted">PDF, Word, Excel, PowerPoint and text files. Up to 4 MiB per file.</p>
      <button className="button primary" type="submit" disabled={busy}>
        {busy ? 'Uploading…' : 'Upload file'}
      </button>
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="feedback success" role="status">
          {message}
        </p>
      )}
    </form>
  );
}

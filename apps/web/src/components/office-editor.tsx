'use client';
import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
type OfficeInstance = { destroyEditor: () => void };
declare global {
  interface Window {
    DocsAPI?: { DocEditor: new (id: string, config: Record<string, unknown>) => OfficeInstance };
  }
}
export function OfficeEditor({ fileId }: { fileId: string }) {
  const [configuration, setConfiguration] = useState<{
    serverURL: string;
    config: Record<string, unknown>;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const editor = useRef<OfficeInstance | null>(null);
  const editingMode = useRef(false);
  useEffect(() => {
    let cancelled = false;
    let checking = false;
    void fetch(`/api/v1/files/${fileId}/office`, { cache: 'no-store' })
      .then(async (response) => {
        if ([401, 403, 404].includes(response.status))
          throw new Error('Your access to this file has ended.');
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Office editing is unavailable.');
        if (!cancelled) {
          editingMode.current = Boolean(result.config.document.permissions.edit);
          setConfiguration(result);
        }
      })
      .catch((cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : 'Office editing is unavailable.');
      });
    const timer = setInterval(async () => {
      if (checking || cancelled) return;
      checking = true;
      try {
        const response = await fetch(`/api/v1/files/${fileId}/office?check=1`, {
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Your access to this file has ended.');
        const current = await response.json();
        // A write-to-view role change closes the old signed editing configuration.
        if (editor.current && editingMode.current && !current.editable)
          throw new Error('Your editing role changed. Reopen this file in view mode.');
      } catch (cause) {
        editor.current?.destroyEditor();
        editor.current = null;
        if (!cancelled) {
          setConnected(false);
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to check file access. Reopen this file.',
          );
        }
      } finally {
        checking = false;
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [fileId]);
  useEffect(() => {
    if (!ready || !configuration || !window.DocsAPI) return;
    editor.current = new window.DocsAPI.DocEditor('office-document', {
      ...configuration.config,
      events: {
        onDocumentReady: () => setConnected(true),
        onError: () =>
          setError(
            'The office editor reported an error. Keep this tab open and check the office service before closing it.',
          ),
      },
    });
    return () => {
      editor.current?.destroyEditor();
      editor.current = null;
    };
  }, [configuration, ready]);
  return (
    <section className="office-studio">
      <p className="feedback" role="status">
        {connected
          ? 'Connected. The original-format file is saved after everyone closes the editor; saving can take several seconds.'
          : error
            ? 'Office editor unavailable.'
            : 'Connecting to the office editor…'}
      </p>
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
      {configuration && (
        <Script
          src={`${configuration.serverURL}/web-apps/apps/api/documents/api.js`}
          strategy="afterInteractive"
          onReady={() => setReady(true)}
          onError={() =>
            setError('The office service is unreachable. Start it and reopen this file.')
          }
        />
      )}
      <div className="office-frame">
        <div id="office-document" />
      </div>
    </section>
  );
}

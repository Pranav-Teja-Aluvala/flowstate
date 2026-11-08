'use client';
import { useEffect, useRef, useState } from 'react';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { Play, Square, RefreshCw, TerminalSquare } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { importRuntimeChanges } from '@/lib/runtime-actions';
import { publishPullRequest } from '@/lib/github-actions';
import { ActionForm } from './forms';
type RuntimeChange = { path: string; baselineHash: string; content: string };
export function SharedTerminal({
  projectId,
  sessionId,
  editable,
  enabled,
}: {
  projectId: string;
  sessionId: string;
  editable: boolean;
  enabled: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const socket = useRef<WebSocket | null>(null);
  const terminal = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState('Stopped');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [changes, setChanges] = useState<RuntimeChange[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [publishRequest, setPublishRequest] = useState<{ id: string; title: string } | null>(null);
  const [reviewed, setReviewed] = useState(false);
  useEffect(() => {
    if (!enabled || !open || !host.current) return;
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let ws: WebSocket | undefined;
    let term: Terminal | undefined;
    void (async () => {
      try {
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
        ]);
        if (cancelled || !host.current) return;
        term = new Terminal({
          cursorBlink: true,
          disableStdin: !editable,
          convertEol: true,
          fontFamily: 'Consolas, monospace',
          fontSize: 13,
          theme: { background: '#202a24', foreground: '#dce6d3', cursor: '#a8c28f' },
        });
        const addon = new FitAddon();
        term.loadAddon(addon);
        term.open(host.current);
        addon.fit();
        terminal.current = term;
        fit.current = addon;
        const response = await fetch('/api/v1/code/terminal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, sessionId }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (cancelled) return;
        ws = new WebSocket(process.env.NEXT_PUBLIC_RUNNER_URL || 'ws://localhost:1236');
        socket.current = ws;
        ws.onopen = () => {
          ws!.send(JSON.stringify({ type: 'authenticate', token: result.token }));
          setStatus('Starting isolated workspace…');
        };
        ws.onmessage = (event) => {
          const message = JSON.parse(event.data);
          if (message.type === 'output') term?.write(message.data);
          if (message.type === 'changes') {
            setChanges(message.changes);
            setReviewed(message.changes.length === 0);
            setNotice(
              message.changes.length
                ? 'Review the terminal edits below before importing.'
                : 'No tracked text-file changes in the terminal.',
            );
          }
          if (message.type === 'publish-review') {
            setPublishRequest({ id: message.id, title: message.title });
            setReviewed(false);
            setNotice(
              'The terminal requested a publish review. Review terminal changes first; publishing uses saved shared code.',
            );
          }
          if (message.type === 'operation-error') setError(message.message);
          if (message.type === 'ready') {
            setStatus('Running');
            ws!.send(JSON.stringify({ type: 'resize', cols: term!.cols, rows: term!.rows }));
          }
          if (message.type === 'error') {
            setError(message.message);
            setStatus('Unavailable');
            setOpen(false);
          }
        };
        ws.onclose = () => {
          if (!cancelled) setStatus('Disconnected');
        };
        ws.onerror = () => {
          setError('Unable to connect to the local Docker runner.');
          setStatus('Unavailable');
          setOpen(false);
        };
        term.onData((data) => {
          if (editable && ws?.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: 'input', data }));
        });
        observer = new ResizeObserver(() => {
          addon.fit();
          if (ws?.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: 'resize', cols: term!.cols, rows: term!.rows }));
        });
        observer.observe(host.current);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Terminal unavailable.');
        setStatus('Unavailable');
        setOpen(false);
      }
    })();
    return () => {
      cancelled = true;
      observer?.disconnect();
      ws?.close();
      term?.dispose();
      socket.current = null;
      terminal.current = null;
    };
  }, [open, projectId, sessionId, editable, enabled]);
  if (!enabled)
    return (
      <section className="terminal-panel">
        <h2>Shared terminal</h2>
        <p>
          Code execution is disabled on this instance. The instance administrator can configure the
          optional Docker runner.
        </p>
      </section>
    );
  return (
    <section className="terminal-panel">
      <header>
        <h2>
          <TerminalSquare size={17} />
          Shared terminal
        </h2>
        <span role="status">{status}</span>
        <div>
          {!open ? (
            <button
              className="button secondary"
              onClick={() => {
                setError('');
                setOpen(true);
              }}
            >
              <Play size={14} />
              {editable ? 'Start terminal' : 'Watch terminal'}
            </button>
          ) : (
            <>
              <button
                className="button secondary"
                disabled={!editable || status !== 'Running' || importing}
                onClick={() => {
                  setError('');
                  socket.current?.send(JSON.stringify({ type: 'review' }));
                }}
              >
                Review terminal changes
              </button>
              <button
                className="button secondary"
                disabled={!editable || status !== 'Running'}
                onClick={() => socket.current?.send(JSON.stringify({ type: 'sync' }))}
              >
                <RefreshCw size={14} />
                Sync saved files
              </button>
              <button
                className="icon-button"
                aria-label="Disconnect terminal"
                onClick={() => {
                  setOpen(false);
                  setStatus('Stopped');
                }}
              >
                <Square size={15} />
              </button>
              {editable && (
                <button
                  className="button secondary"
                  disabled={status !== 'Running'}
                  onClick={() => socket.current?.send(JSON.stringify({ type: 'stop' }))}
                >
                  Stop workspace
                </button>
              )}
            </>
          )}
        </div>
      </header>
      <p>
        Runs a snapshot of this repository in a local Docker container. No host folders or GitHub
        credentials are mounted. Network access is disabled. Use “Sync saved files” after editing.
      </p>
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="feedback success" role="status">
          {notice}
        </p>
      )}
      {changes && changes.length > 0 && (
        <section className="runtime-review">
          <h3>Review before importing</h3>
          <p>
            Importing updates shared code for everyone. New files, deleted files and binary changes
            are not imported.
          </p>
          {changes.map((change) => (
            <details key={change.path}>
              <summary>{change.path}</summary>
              <pre>{change.content}</pre>
            </details>
          ))}
          <button
            className="button primary"
            disabled={!editable || importing}
            onClick={async () => {
              setImporting(true);
              setError('');
              try {
                const result = await importRuntimeChanges(sessionId, changes);
                if (result.error) setError(result.error);
                else {
                  setNotice(result.success || 'Runtime changes imported.');
                  setChanges(null);
                  setReviewed(true);
                }
              } catch {
                setError('Import interrupted. Check the shared editor before retrying.');
              } finally {
                setImporting(false);
              }
            }}
          >
            {importing ? 'Importing…' : 'Import reviewed changes'}
          </button>
        </section>
      )}
      {publishRequest && editable && (
        <section className="runtime-review">
          <h3>Confirm terminal publish request</h3>
          <p>
            Review and import terminal changes first. Publishing creates a new feature branch and
            pull request from saved shared code.
          </p>
          {reviewed ? (
            <ActionForm
              key={publishRequest.id}
              action={publishPullRequest}
              label="Confirm branch and pull request"
            >
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="sessionId" value={sessionId} />
              <label>
                Commit message
                <input name="title" defaultValue={publishRequest.title} required maxLength={150} />
              </label>
            </ActionForm>
          ) : (
            <p className="muted">Use “Review terminal changes” above to continue.</p>
          )}
        </section>
      )}
      {open && <div className="terminal-host" ref={host} aria-label="Shared terminal output" />}
    </section>
  );
}

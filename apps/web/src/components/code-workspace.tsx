'use client';
import { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
} from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { useRouter } from 'next/navigation';
import { FileCode2, Folder, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { openCodeFile } from '@/lib/github-actions';
import type { GitHubEntry } from '@flowstate/github';
function language(path: string) {
  if (/\.[jt]sx?$/.test(path))
    return javascript({ typescript: /\.tsx?$/.test(path), jsx: /x$/.test(path) });
  if (path.endsWith('.json')) return json();
  if (path.endsWith('.py')) return python();
  if (path.endsWith('.css')) return css();
  if (/\.html?$/.test(path)) return html();
  return [];
}
export function FileBrowser({
  entries,
  projectId,
  sessionId,
  baseUrl,
  parent,
}: {
  entries: GitHubEntry[];
  projectId: string;
  sessionId: string;
  baseUrl: string;
  parent: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [opening, setOpening] = useState('');
  return (
    <div className="file-browser">
      <h2>Repository files</h2>
      {parent !== null && (
        <Link href={`${baseUrl}&path=${encodeURIComponent(parent)}`}>↰ Parent directory</Link>
      )}
      {entries.map((entry) =>
        entry.type === 'dir' ? (
          <Link key={entry.path} href={`${baseUrl}&path=${encodeURIComponent(entry.path)}`}>
            <Folder size={15} />
            {entry.name}
          </Link>
        ) : (
          <button
            key={entry.path}
            disabled={Boolean(opening) || entry.type !== 'file'}
            onClick={async () => {
              setError('');
              setOpening(entry.path);
              try {
                const result = await openCodeFile({ projectId, sessionId, path: entry.path });
                if (result.error) setError(result.error);
                else router.push(`${baseUrl}&file=${result.fileId}`);
              } catch {
                setError('Unable to open this file. Check your connection and try again.');
              } finally {
                setOpening('');
              }
            }}
          >
            <FileCode2 size={15} />
            {opening === entry.path ? 'Opening…' : entry.name}
            <ArrowUpRight size={12} />
          </button>
        ),
      )}
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function SharedCodeEditor({
  fileId,
  path,
  user,
  editable,
}: {
  fileId: string;
  path: string;
  user: { id: string; name: string };
  editable: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Connecting');
  const [people, setPeople] = useState<string[]>([]);
  useEffect(() => {
    let view: EditorView | undefined;
    const document = new Y.Doc();
    const text = document.getText('code');
    const undoManager = new Y.UndoManager(text);
    const provider = new HocuspocusProvider({
      url: process.env.NEXT_PUBLIC_COLLABORATION_URL || 'ws://localhost:1234',
      name: `code:${fileId}`,
      document,
      token: async () => {
        const response = await fetch(`/api/v1/code/files/${fileId}/ticket`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Access denied');
        return (await response.json()).token;
      },
      onAuthenticationFailed: () => {
        setStatus('Access denied');
        view?.dispatch({ effects: [] });
        if (view) {
          view.destroy();
          view = undefined;
        }
      },
      onClose: ({ event }) => {
        setStatus(
          /Access|Permissions/.test(event.reason || '')
            ? 'Access changed — reload to reconnect'
            : 'Disconnected — reconnecting',
        );
        if (view) {
          view.destroy();
          view = undefined;
        }
      },
      onSynced: ({ state }) => {
        if (!state || view || !host.current) return;
        setStatus('Connected');
        provider.setAwarenessField('user', {
          id: user.id,
          name: user.name,
          color: '#657e54',
          colorLight: '#657e5433',
        });
        view = new EditorView({
          parent: host.current,
          state: EditorState.create({
            doc: text.toString(),
            extensions: [
              lineNumbers(),
              highlightActiveLine(),
              drawSelection(),
              keymap.of([...yUndoManagerKeymap, ...defaultKeymap, indentWithTab]),
              language(path),
              syntaxHighlighting(defaultHighlightStyle),
              yCollab(text, provider.awareness!, { undoManager }),
              EditorView.editable.of(editable),
              EditorState.readOnly.of(!editable),
              EditorView.contentAttributes.of({
                'aria-label': 'Shared source code',
                role: 'textbox',
                'aria-multiline': 'true',
              }),
              EditorView.theme({
                '&': {
                  fontSize: '13px',
                  minHeight: '420px',
                  backgroundColor: '#f8f5ec',
                  color: '#30352c',
                },
                '.cm-content': { fontFamily: 'Consolas, monospace', padding: '20px 0' },
                '.cm-gutters': { backgroundColor: '#eeeae0', color: '#626b57', border: 'none' },
                '.cm-scroller': { overflow: 'auto' },
              }),
            ],
          }),
        });
      },
      onStateless: ({ payload }) => {
        try {
          const message = JSON.parse(payload);
          setStatus(
            message.type === 'saved'
              ? provider.hasUnsyncedChanges
                ? 'Saving…'
                : 'Saved to database'
              : 'Save failed — keep this page open',
          );
        } catch {}
      },
      onAwarenessUpdate: ({ states }) =>
        setPeople([
          ...new Set<string>(
            states.map((s) => s.user?.name).filter((s): s is string => Boolean(s)),
          ),
        ]),
    });
    document.on('update', (_update, origin) => {
      if (origin !== provider) setStatus('Saving…');
    });
    return () => {
      view?.destroy();
      provider.destroy();
      undoManager.destroy();
      document.destroy();
    };
  }, [fileId, path, user.id, user.name, editable]);
  return (
    <section className="shared-code">
      <header>
        <strong>{path}</strong>
        <span role="status">{status}</span>
      </header>
      <div className="code-presence">
        {people.length} online · {people.join(', ')}
      </div>
      <div ref={host} />
      <footer>
        {editable
          ? 'Edits are shared and saved within FLOWSTATE. Publish a pull request to send them to GitHub.'
          : 'Read-only access. GitHub write permission and an editor role are required to edit.'}
      </footer>
    </section>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { Plus, Table2, Presentation, Trash2 } from 'lucide-react';
import {
  calculateCell,
  columnName,
  sheetDimension,
  SHEET_MAX_ROWS,
  SHEET_MAX_COLUMNS,
} from '@flowstate/contracts';
type StudioSession = { document: Y.Doc; provider: HocuspocusProvider };
export function StructuredStudio({
  documentId,
  kind,
  editable,
  user,
}: {
  documentId: string;
  kind: 'sheet' | 'slides';
  editable: boolean;
  user: { id: string; name: string };
}) {
  const [session, setSession] = useState<StudioSession | null>(null);
  const [status, setStatus] = useState('Connecting…');
  const [people, setPeople] = useState<string[]>([]);
  useEffect(() => {
    const document = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: process.env.NEXT_PUBLIC_COLLABORATION_URL || 'ws://localhost:1234',
      name: documentId,
      document,
      token: async () => {
        const response = await fetch(`/api/v1/documents/${documentId}/ticket`, {
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Access denied');
        return (await response.json()).token;
      },
      onSynced: ({ state }) => {
        if (state) {
          setStatus('Saved to database');
          setSession({ document, provider });
        }
      },
      onStatus: ({ status }) => {
        if (status !== 'connected')
          setStatus(status === 'connecting' ? 'Reconnecting…' : 'Disconnected');
      },
      onAuthenticationFailed: () => {
        setStatus('Access denied');
        setSession(null);
      },
      onClose: ({ event }) => {
        if (/Access|Permissions/.test(event.reason || '')) {
          setStatus('Access denied');
          setSession(null);
        }
      },
      onStateless: ({ payload }) => {
        try {
          const message = JSON.parse(payload);
          setStatus(
            message.type === 'saved'
              ? provider.hasUnsyncedChanges
                ? 'Saving…'
                : 'Saved to database'
              : 'Save failed — keep this tab open',
          );
        } catch {}
      },
      onAwarenessUpdate: ({ states }) => {
        const members = new Map<string, string>();
        for (const state of states)
          if (typeof state.user?.id === 'string' && typeof state.user?.name === 'string')
            members.set(state.user.id, state.user.name);
        setPeople([...members.values()]);
      },
    });
    document.on('update', (_update, origin) => {
      if (origin !== provider) setStatus('Saving…');
    });
    provider.setAwarenessField('user', { id: user.id, name: user.name });
    return () => {
      provider.destroy();
      document.destroy();
    };
  }, [documentId, user.id, user.name]);
  return (
    <section className="structured-studio">
      <header className="editor-status">
        <span className="connection connected">
          {kind === 'sheet' ? <Table2 size={15} /> : <Presentation size={15} />}
          {kind === 'sheet' ? 'Shared spreadsheet' : 'Shared presentation'}
        </span>
        <span role="status" data-testid="save-status">
          {status}
        </span>
        <span className="structured-people" aria-label="Online collaborators">
          {people.length} online{people.length ? ` · ${people.join(', ')}` : ''}
        </span>
      </header>
      {session ? (
        kind === 'sheet' ? (
          <SheetEditor document={session.document} editable={editable} />
        ) : (
          <SlidesEditor document={session.document} editable={editable} />
        )
      ) : (
        <p className="feedback">{status}</p>
      )}
    </section>
  );
}
function useStudio(document: Y.Doc) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh((n) => n + 1);
    document.on('update', update);
    return () => document.off('update', update);
  }, [document]);
  return document.getMap<string>('studio');
}
function SheetEditor({ document, editable }: { document: Y.Doc; editable: boolean }) {
  const studio = useStudio(document);
  const rows = sheetDimension(studio.get('sheet:rows'), 20, SHEET_MAX_ROWS),
    columns = sheetDimension(studio.get('sheet:columns'), 8, SHEET_MAX_COLUMNS);
  const [selected, setSelected] = useState('A1');
  const [focused, setFocused] = useState('');
  const [pasteError, setPasteError] = useState('');
  const cells: Record<string, string> = {};
  for (const [key, value] of studio.entries())
    if (/^[A-Z]\d+$/.test(key) && typeof value === 'string') cells[key] = value.slice(0, 500);
  const set = (key: string, value: string) => {
    if (editable) studio.set(key, value.slice(0, 500));
  };
  return (
    <div className="sheet-studio">
      <div className="sheet-toolbar">
        <span className="cell-address">{selected}</span>
        <span className="formula-symbol">fx</span>
        <input
          aria-label="Cell formula or value"
          value={cells[selected] || ''}
          onChange={(event) => set(selected, event.target.value)}
          readOnly={!editable}
          maxLength={500}
        />
        <span className="sheet-hint">Try =SUM(A1:B4) or =A1*2</span>
      </div>
      {pasteError && (
        <p className="feedback error" role="alert">
          {pasteError}
        </p>
      )}
      <div className="sheet-grid-wrap">
        <table className="sheet-grid" aria-label="Shared spreadsheet">
          <thead>
            <tr>
              <th aria-label="Row numbers" />
              {Array.from({ length: columns }, (_, c) => (
                <th key={c} scope="col">
                  {columnName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                <th scope="row">{r + 1}</th>
                {Array.from({ length: columns }, (_, c) => {
                  const key = `${columnName(c)}${r + 1}`;
                  return (
                    <td key={key} className={selected === key ? 'active-cell' : ''}>
                      <input
                        aria-label={`Cell ${key}`}
                        value={focused === key ? cells[key] || '' : calculateCell(cells, key)}
                        readOnly={!editable}
                        maxLength={500}
                        onFocus={() => {
                          setSelected(key);
                          setFocused(key);
                        }}
                        onBlur={() => setFocused('')}
                        onChange={(event) => set(key, event.target.value)}
                        onPaste={(event) => {
                          const text = event.clipboardData.getData('text');
                          if (!editable || (!text.includes('\t') && !text.includes('\n'))) return;
                          event.preventDefault();
                          const matrix = text
                            .replace(/\r\n?/g, '\n')
                            .replace(/\n$/, '')
                            .split('\n', 101)
                            .map((line) => line.split('\t', 27));
                          const width = Math.max(...matrix.map((line) => line.length));
                          if (
                            r + matrix.length > SHEET_MAX_ROWS ||
                            c + width > SHEET_MAX_COLUMNS ||
                            matrix.some((line) => line.some((value) => value.length > 500))
                          ) {
                            setPasteError(
                              'Paste a smaller selection: up to 100 rows, 26 columns and 500 characters per cell. Nothing was changed.',
                            );
                            return;
                          }
                          setPasteError('');
                          document.transact(() => {
                            if (r + matrix.length > rows)
                              studio.set('sheet:rows', String(r + matrix.length));
                            if (c + width > columns) studio.set('sheet:columns', String(c + width));
                            matrix.forEach((line, dr) =>
                              line.forEach((value, dc) =>
                                set(`${columnName(c + dc)}${r + dr + 1}`, value),
                              ),
                            );
                          });
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="sheet-footer">
        {editable && (
          <>
            <button
              className="button secondary"
              disabled={rows >= SHEET_MAX_ROWS}
              onClick={() => studio.set('sheet:rows', String(rows + 1))}
            >
              <Plus size={13} /> Add row
            </button>
            <button
              className="button secondary"
              disabled={columns >= SHEET_MAX_COLUMNS}
              onClick={() => studio.set('sheet:columns', String(columns + 1))}
            >
              <Plus size={13} /> Add column
            </button>
          </>
        )}
        <span>
          {rows} rows × {columns} columns · formulas support SUM, cell references and arithmetic
        </span>
      </footer>
    </div>
  );
}
function SlidesEditor({ document, editable }: { document: Y.Doc; editable: boolean }) {
  const studio = useStudio(document),
    slides = document.getArray<string>('slides');
  const ids = slides
    .toArray()
    .filter((id) => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id))
    .slice(0, 30);
  const [selected, setSelected] = useState('');
  const active = ids.includes(selected) ? selected : ids[0];
  const field = (name: string) => {
    const value = studio.get(`${active}:${name}`);
    return typeof value === 'string' ? value : '';
  };
  function addSlide() {
    if (!editable || ids.length >= 30) return;
    const id = crypto.randomUUID();
    document.transact(() => {
      slides.push([id]);
      studio.set(`${id}:title`, 'A new idea');
      studio.set(`${id}:body`, '');
    });
    setSelected(id);
  }
  return (
    <div className="slides-studio">
      <aside className="slide-thumbnails" aria-label="Slides">
        {ids.map((id, index) => (
          <button
            className={active === id ? 'selected' : ''}
            key={id}
            onClick={() => setSelected(id)}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{studio.get(`${id}:title`) || 'Untitled slide'}</strong>
          </button>
        ))}
        {editable && (
          <button className="add-slide" onClick={addSlide} disabled={ids.length >= 30}>
            <Plus size={15} /> Add slide
          </button>
        )}
      </aside>
      <div className="slide-workspace">
        {active ? (
          <>
            <div className="slide-controls">
              <span>
                Slide {ids.indexOf(active) + 1} of {ids.length}
              </span>
              {editable && ids.length > 1 && (
                <button
                  className="icon-button"
                  aria-label="Delete selected slide"
                  onClick={() => {
                    if (!window.confirm('Delete this slide?')) return;
                    document.transact(() => {
                      slides.delete(ids.indexOf(active), 1);
                      studio.delete(`${active}:title`);
                      studio.delete(`${active}:body`);
                    });
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
            <section className="slide-canvas">
              <div className="slide-accent" />
              <input
                aria-label="Slide title"
                value={field('title')}
                placeholder="Give your idea a title"
                maxLength={150}
                readOnly={!editable}
                onChange={(event) => studio.set(`${active}:title`, event.target.value)}
              />
              <textarea
                aria-label="Slide content"
                value={field('body')}
                placeholder="Add your talking points…"
                maxLength={4000}
                readOnly={!editable}
                onChange={(event) => studio.set(`${active}:body`, event.target.value)}
              />
              <span className="slide-page-number">{ids.indexOf(active) + 1}</span>
            </section>
          </>
        ) : (
          <div className="empty-state">
            <h3>Start your presentation.</h3>
            {editable && (
              <button className="button primary" onClick={addSlide}>
                Add slide
              </button>
            )}
          </div>
        )}
      </div>
      <div className="print-slides">
        {ids.map((id, index) => (
          <section className="print-slide" key={id}>
            <h2>{studio.get(`${id}:title`) || 'Untitled slide'}</h2>
            <p>{studio.get(`${id}:body`) || ''}</p>
            <small>{index + 1}</small>
          </section>
        ))}
      </div>
    </div>
  );
}

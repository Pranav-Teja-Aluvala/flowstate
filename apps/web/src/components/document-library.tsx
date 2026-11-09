'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, FileText, Search } from 'lucide-react';
export const documentKindNames: Record<string, string> = {
  richtext: 'Document',
  word: 'Word',
  sheet: 'Excel',
  slides: 'PowerPoint',
  pdf: 'PDF',
};
export function DocumentLibrary({
  documents,
  base,
}: {
  documents: { id: string; title: string; kind: string; updatedAt: string }[];
  base: string;
}) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [order, setOrder] = useState('newest');
  const filtered = documents
    .filter(
      (d) =>
        (kind === 'all' || d.kind === kind) &&
        d.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
    )
    .sort((a, b) =>
      order === 'title' ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt),
    );
  return (
    <section aria-label="Document library">
      <div className="library-toolbar">
        <label className="library-search">
          <Search size={17} />
          <span className="sr-only">Search documents</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a document…"
          />
        </label>
        <label>
          <span className="sr-only">Document type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">All types</option>
            {Object.entries(documentKindNames).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Sort documents</span>
          <select value={order} onChange={(e) => setOrder(e.target.value)}>
            <option value="newest">Recently updated</option>
            <option value="title">Name A–Z</option>
          </select>
        </label>
      </div>
      <p className="muted small" role="status">
        {filtered.length} {filtered.length === 1 ? 'document' : 'documents'}
        {search || kind !== 'all' ? ' found' : ''}
      </p>
      {filtered.length ? (
        <div className="library-list">
          {filtered.map((d) => (
            <Link aria-label={d.title} key={d.id} href={`${base}/d/${d.id}`}>
              <span className={`library-format format-${d.kind}`}>
                <FileText size={22} />
              </span>
              <span className="library-title">
                <strong>{d.title}</strong>
                <small>
                  {documentKindNames[d.kind] || 'Document'} · Updated{' '}
                  {new Date(d.updatedAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })}
                </small>
              </span>
              <span className="library-open">
                Open <ArrowUpRight size={15} />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <FileText size={28} />
          <h2>{documents.length ? 'No matching documents.' : 'Start with a blank page.'}</h2>
          <p>
            {documents.length
              ? 'Try a different name or document type.'
              : 'Choose New document to write a brief, plan a budget, build slides or prepare a PDF. Invite teammates to edit with you.'}
          </p>
          {documents.length > 0 && (
            <button
              className="button secondary"
              onClick={() => {
                setSearch('');
                setKind('all');
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </section>
  );
}

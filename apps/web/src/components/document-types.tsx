'use client';
import { useState } from 'react';
const types = [
  { id: 'richtext', mark: 'Aa', name: 'Document', detail: 'A shared page for notes and ideas' },
  { id: 'word', mark: 'W', name: 'Word', detail: 'Write together. Export a .docx file.' },
  { id: 'sheet', mark: 'X', name: 'Excel', detail: 'Shared cells, formulas and .xlsx export' },
  { id: 'slides', mark: 'P', name: 'PowerPoint', detail: 'Build slides and export a .pptx deck' },
  { id: 'pdf', mark: 'PDF', name: 'PDF', detail: 'Design a shared page. Export as PDF.' },
];
export function DocumentTypes() {
  const [selected, setSelected] = useState('richtext');
  return (
    <fieldset className="document-type-picker">
      <legend>What would you like to create?</legend>
      <input type="hidden" name="kind" value={selected} />
      <div>
        {types.map((type) => (
          <button
            key={type.id}
            type="button"
            className={selected === type.id ? 'document-type selected' : 'document-type'}
            aria-pressed={selected === type.id}
            aria-label={`Create ${type.name}`}
            onClick={() => setSelected(type.id)}
          >
            <span className={`format-mark format-${type.id}`}>{type.mark}</span>
            <span>
              <strong>{type.name}</strong>
              <small>{type.detail}</small>
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

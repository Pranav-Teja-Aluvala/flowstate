'use client';
import { useEffect, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Link as LinkIcon,
  Undo2,
  Redo2,
  Wifi,
  WifiOff,
} from 'lucide-react';
type Person = { id: string; name: string; color: string };
export function CollaborativeEditor({
  documentId,
  user,
  editable,
}: {
  documentId: string;
  user: { id: string; name: string };
  editable: boolean;
}) {
  const [session, setSession] = useState<{ document: Y.Doc; provider: HocuspocusProvider } | null>(
    null,
  );
  const [status, setStatus] = useState('Connecting');
  const [saved, setSaved] = useState('Waiting for sync');
  const [people, setPeople] = useState<Person[]>([]);
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
        if (!response.ok) {
          setStatus('Access denied');
          throw new Error('Access denied');
        }
        return (await response.json()).token;
      },
      onStatus: ({ status }) =>
        setStatus(
          status === 'connected'
            ? 'Connected'
            : status === 'connecting'
              ? 'Reconnecting'
              : 'Disconnected',
        ),
      onAuthenticationFailed: () => {
        setStatus('Access denied');
        setSaved('Your access may have changed. Reload to check.');
      },
      onClose: ({ event }) => {
        setStatus(
          event.reason?.includes('Access') || event.reason?.includes('Permissions')
            ? 'Access denied'
            : 'Disconnected',
        );
      },
      onSynced: ({ state }) => {
        if (state) {
          setSaved('Synced');
          setSession({ document, provider });
        }
      },
      onStateless: ({ payload }) => {
        try {
          const message = JSON.parse(payload);
          setSaved(
            message.type === 'saved' ? 'Saved to database' : 'Save failed — keep this page open',
          );
        } catch {
          /* Ignore unknown server messages. */
        }
      },
      onAwarenessUpdate: ({ states }) => {
        const unique = new Map<string, Person>();
        for (const state of states) if (state.user?.id) unique.set(state.user.id, state.user);
        setPeople([...unique.values()]);
      },
    });
    document.on('update', (_update, origin) => {
      if (origin !== provider) setSaved('Saving…');
    });
    return () => {
      provider.destroy();
      document.destroy();
    };
  }, [documentId]);
  return (
    <section className="editor-panel">
      <div className="editor-status">
        <span className={status === 'Connected' ? 'connection connected' : 'connection'}>
          {status === 'Connected' ? <Wifi size={13} /> : <WifiOff size={13} />}
          {status}
        </span>
        <span role="status" data-testid="save-status">
          {saved}
        </span>
        <div className="collaborators" aria-label="Online collaborators">
          {people.map((person) => (
            <span
              className="collaborator"
              key={person.id}
              title={person.name}
              style={{ background: `${person.color}22`, color: person.color }}
            >
              {person.name.slice(0, 1)}
            </span>
          ))}
          <span>{people.length} online</span>
        </div>
      </div>
      {session ? (
        <EditorSurface
          document={session.document}
          provider={session.provider}
          user={user}
          editable={editable && status === 'Connected'}
        />
      ) : (
        <p className="editor-loading">Connecting to your shared document…</p>
      )}
      <footer className="editor-footer">
        <span>{editable ? 'A little space for your ideas.' : 'You have view-only access.'}</span>
        <span>Changes save through collaboration.</span>
      </footer>
    </section>
  );
}
function EditorSurface({
  document,
  provider,
  user,
  editable,
}: {
  document: Y.Doc;
  provider: HocuspocusProvider;
  user: { id: string; name: string };
  editable: boolean;
}) {
  const colors = ['#657e54', '#b1865c', '#6c8d9a', '#a67682', '#8d83ad'];
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editable,
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        link: {
          openOnClick: false,
          isAllowedUri: (url, context) =>
            context.defaultValidate(url) && /^(https?:|mailto:)/i.test(url),
        },
      }),
      Collaboration.configure({ document }),
      CollaborationCaret.configure({
        provider,
        user: { ...user, color: colors[parseInt(user.id.slice(0, 8), 16) % colors.length] },
      }),
    ],
    editorProps: {
      attributes: {
        class: 'document-content',
        'aria-label': 'Document content',
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
  });
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);
  if (!editor) return <p className="editor-loading">Opening the editor…</p>;
  const tools = [
    {
      label: 'Bold',
      icon: Bold,
      active: editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: 'Italic',
      icon: Italic,
      active: editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: 'Heading 1',
      icon: Heading1,
      active: editor.isActive('heading', { level: 1 }),
      run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: 'Heading 2',
      icon: Heading2,
      active: editor.isActive('heading', { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: 'Bullet list',
      icon: List,
      active: editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: 'Numbered list',
      icon: ListOrdered,
      active: editor.isActive('orderedList'),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: 'Link',
      icon: LinkIcon,
      active: editor.isActive('link'),
      run: () => {
        const href = window.prompt(
          'Link URL (https://…) ',
          editor.getAttributes('link').href || 'https://',
        );
        if (href === null) return;
        if (!href) {
          editor.chain().focus().unsetLink().run();
          return;
        }
        try {
          const url = new URL(href);
          if (['https:', 'http:', 'mailto:'].includes(url.protocol))
            editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
        } catch {
          /* Invalid URLs are not inserted. */
        }
      },
    },
    { label: 'Undo', icon: Undo2, active: false, run: () => editor.chain().focus().undo().run() },
    { label: 'Redo', icon: Redo2, active: false, run: () => editor.chain().focus().redo().run() },
  ];
  return (
    <>
      <div className="editor-toolbar" role="toolbar" aria-label="Text formatting">
        {tools.map((tool) => (
          <button
            key={tool.label}
            className={tool.active ? 'tool active' : 'tool'}
            type="button"
            aria-label={tool.label}
            title={tool.label}
            aria-pressed={tool.active}
            disabled={!editable}
            onClick={tool.run}
          >
            <tool.icon size={16} />
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </>
  );
}

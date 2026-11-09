'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
export function WorkspacePresence({ workspaceId }: { workspaceId: string }) {
  const [people, setPeople] = useState<{ id: string; name: string }[] | null>(null);
  const [failed, setFailed] = useState(false);
  const lastRevision = useRef<string | undefined>(undefined);
  const router = useRouter();
  useEffect(() => {
    let cancelled = false,
      busy = false;
    const heartbeat = async () => {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const response = await fetch(`/api/v1/workspaces/${workspaceId}/presence`, {
          method: 'POST',
          cache: 'no-store',
        });
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!cancelled) {
          setPeople(result.people);
          setFailed(false);
          const focused = document.activeElement as HTMLElement | null;
          const editing =
            focused?.isContentEditable ||
            ['INPUT', 'TEXTAREA', 'SELECT', 'IFRAME'].includes(focused?.tagName || '');
          if (
            lastRevision.current !== undefined &&
            lastRevision.current !== result.revision &&
            !editing
          )
            router.refresh();
          if (!editing || lastRevision.current === undefined)
            lastRevision.current = result.revision;
        }
      } catch {
        if (!cancelled) {
          setPeople(null);
          setFailed(true);
        }
      } finally {
        busy = false;
      }
    };
    void heartbeat();
    const timer = setInterval(heartbeat, 12_000);
    document.addEventListener('visibilitychange', heartbeat);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', heartbeat);
    };
  }, [workspaceId, router]);
  return (
    <section className="workspace-presence" aria-label="Workspace presence">
      <span className="presence-label">
        {failed
          ? 'Presence unavailable'
          : people
            ? `${people.length}${people.length === 100 ? '+' : ''} here now`
            : 'Checking presence…'}
      </span>
      {people && (
        <div
          className="presence-people"
          aria-label={people.map((person) => person.name).join(', ')}
        >
          {people.slice(0, 5).map((person) => (
            <span className="avatar" key={person.id} title={person.name}>
              {person.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

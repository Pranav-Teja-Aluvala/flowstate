'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderKanban, Settings2 } from 'lucide-react';
export function ShellNavigation({ workspaceId }: { workspaceId?: string }) {
  const path = usePathname();
  const settings = workspaceId ? `/w/${workspaceId}/settings` : '';
  const inSettings = path === settings;
  const inProjects = !inSettings && path !== '/help';
  return (
    <nav aria-label="Workspace navigation">
      <Link
        className={inProjects ? 'nav-link active' : 'nav-link'}
        aria-current={inProjects ? 'page' : undefined}
        href={workspaceId ? `/w/${workspaceId}` : '/app'}
      >
        <FolderKanban size={18} />
        Projects{inProjects && <span className="nav-indicator" />}
      </Link>
      {workspaceId && (
        <Link
          className={inSettings ? 'nav-link active' : 'nav-link'}
          aria-current={inSettings ? 'page' : undefined}
          href={settings}
        >
          <Settings2 size={18} />
          Members & settings
        </Link>
      )}
    </nav>
  );
}

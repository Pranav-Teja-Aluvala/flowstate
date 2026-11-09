'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderKanban, Settings2, Activity } from 'lucide-react';
export function ShellNavigation({ workspaceId }: { workspaceId?: string }) {
  const path = usePathname();
  const settings = workspaceId ? `/w/${workspaceId}/settings` : '';
  const inSettings = path === settings;
  const activity = workspaceId ? `/w/${workspaceId}/activity` : '';
  const inActivity = path === activity;
  const inProjects = !inSettings && !inActivity && path !== '/help';
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
          className={inActivity ? 'nav-link active' : 'nav-link'}
          aria-current={inActivity ? 'page' : undefined}
          href={activity}
        >
          <Activity size={18} />
          Activity
        </Link>
      )}
      {workspaceId && (
        <Link
          className={inSettings ? 'nav-link active' : 'nav-link'}
          aria-current={inSettings ? 'page' : undefined}
          href={settings}
          aria-label="Members & settings"
        >
          <Settings2 size={18} />
          <span className="nav-label-full">Members & settings</span>
          <span className="nav-label-short">Members</span>
        </Link>
      )}
    </nav>
  );
}

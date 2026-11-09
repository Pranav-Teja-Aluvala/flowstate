import Link from 'next/link';
import { Layers2, LogOut, Plus, ChevronDown, CircleHelp } from 'lucide-react';
import { logout } from '@/lib/actions';
import { WorkspacePresence } from './workspace-presence';
import { ShellNavigation } from './shell-nav';
type Workspace = { id: string; name: string };
export function Shell({
  user,
  workspaces,
  active,
  children,
}: {
  user: { name: string; email: string };
  workspaces: Workspace[];
  active?: string;
  children: React.ReactNode;
}) {
  const current = workspaces.find((w) => w.id === active);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace-content">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <Link href="/app" className="brand">
          <Layers2 size={23} />
          FLOWSTATE
          <span className="brand-dot" />
        </Link>
        <details className="workspace-switch">
          <summary>
            <span className="workspace-icon">{current?.name.slice(0, 1).toUpperCase() || 'F'}</span>
            <span>
              {current?.name || 'Your workspaces'}
              <small>Team workspace</small>
            </span>
            <ChevronDown size={15} />
          </summary>
          <div className="switch-menu">
            {workspaces.map((w) => (
              <Link key={w.id} href={`/w/${w.id}`}>
                {w.name}
              </Link>
            ))}
            <Link href="/app?new=1">
              <Plus size={14} />
              Create a workspace
            </Link>
          </div>
        </details>
        <div className="nav-label">WORKSPACE</div>
        <ShellNavigation workspaceId={active} />
        {active && <WorkspacePresence key={active} workspaceId={active} />}
        <div className="sidebar-bottom">
          <div className="help-link">
            <CircleHelp size={16} />
            Built for working together
          </div>
          <div className="profile">
            <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </span>
            <form action={logout}>
              <button className="icon-button" aria-label="Sign out">
                <LogOut size={16} />
              </button>
            </form>
          </div>
        </div>
      </aside>
      <div className="main-panel" id="workspace-content" tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}

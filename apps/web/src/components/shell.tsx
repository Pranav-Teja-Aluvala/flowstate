import Link from 'next/link';
import {
  Layers2,
  ArrowUpRight,
  FolderKanban,
  LogOut,
  Plus,
  ChevronDown,
  Settings2,
  CircleHelp,
} from 'lucide-react';
import { logout } from '@/lib/actions';
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
      <aside className="sidebar">
        <Link href="/" className="brand">
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
            <Link href="/?new=1">
              <Plus size={14} />
              Create a workspace
            </Link>
          </div>
        </details>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          <Link className="nav-link active" href={active ? `/w/${active}` : '/'}>
            <FolderKanban size={18} />
            Projects <span className="nav-indicator" />
          </Link>
          {active && (
            <Link className="nav-link" href={`/w/${active}/settings`}>
              <Settings2 size={18} />
              Members & settings
            </Link>
          )}
        </nav>
        <div className="sidebar-note">
          <span className="note-line" />
          <p>
            A little less scattered.
            <br />
            <strong>A little more in sync.</strong>
          </p>
          <ArrowUpRight size={19} />
        </div>
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
      <div className="main-panel">{children}</div>
    </div>
  );
}

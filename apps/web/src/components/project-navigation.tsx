import Link from 'next/link';
import { LayoutDashboard, FileText, FolderOpen, GitBranch, Settings2 } from 'lucide-react';
export function ProjectNavigation({
  workspaceId,
  projectId,
  active,
}: {
  workspaceId: string;
  projectId: string;
  active: 'boards' | 'documents' | 'files' | 'code' | 'settings';
}) {
  const base = `/w/${workspaceId}/p/${projectId}`;
  const areas = [
    { id: 'boards', label: 'Boards', href: base, icon: LayoutDashboard },
    { id: 'documents', label: 'Documents', href: `${base}/documents`, icon: FileText },
    { id: 'files', label: 'Files', href: `${base}/files`, icon: FolderOpen },
    { id: 'code', label: 'Code & GitHub', href: `${base}/code`, icon: GitBranch },
    { id: 'settings', label: 'Settings', href: `${base}/settings`, icon: Settings2 },
  ];
  return (
    <nav className="project-navigation" aria-label="Project areas">
      {areas.map(({ id, label, href, icon: Icon }) => (
        <Link key={id} href={href} aria-current={active === id ? 'page' : undefined}>
          <Icon size={15} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

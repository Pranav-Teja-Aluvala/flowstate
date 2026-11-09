const labels: Record<string, string> = {
  'workspace.created': 'created the workspace',
  'project.created': 'created a project',
  'board.created': 'created a board',
  'column.created': 'added a board column',
  'task.created': 'created a task',
  'task.updated': 'updated a task',
  'task.moved': 'moved a task',
  'task.deleted': 'deleted a task',
  'document.created': 'created a document',
  'document.renamed': 'renamed a document',
  'note.shared': 'shared a team note',
  'member.invited': 'invited a teammate',
  'member.joined': 'joined the workspace',
  'member.removed': 'removed a workspace member',
  'member.role_changed': 'changed a member’s role',
  'repository.connected': 'connected a GitHub repository',
  'code.commented': 'commented on a code session',
  'code.suggested': 'suggested a code change',
  'code.approved': 'approved a code suggestion',
  'code.rejected': 'rejected a code suggestion',
  'code.applied': 'applied an approved code change',
  'file.restored': 'restored a saved file version',
  'file.uploaded': 'uploaded a file',
  'file.saved': 'saved a shared file',
};
export function activityLabel(action: string) {
  return labels[action] || action.replaceAll('.', ' ').replaceAll('_', ' ');
}

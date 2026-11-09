import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  primaryKey,
  uniqueIndex,
  integer,
  customType,
} from 'drizzle-orm/pg-core';

export const role = pgEnum('role', ['owner', 'admin', 'editor', 'viewer']);
export const taskPriority = pgEnum('task_priority', ['low', 'normal', 'high', 'urgent']);
const dates = { createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull() };
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  ...dates,
});
export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...dates,
});
export const authLimits = pgTable('auth_limits', {
  key: text('key').primaryKey(),
  attempts: integer('attempts').notNull(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
});
export const workspaces = pgTable('workspaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  ...dates,
});
export const memberships = pgTable(
  'memberships',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: role('role').notNull(),
    ...dates,
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);
export const workspaceNotes = pgTable('workspace_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id),
  body: text('body').notNull(),
  ...dates,
});
export const workspacePresence = pgTable(
  'workspace_presence',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    sessionHash: text('session_hash')
      .notNull()
      .references(() => sessions.tokenHash, { onDelete: 'cascade' }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.sessionHash] })],
);
export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  ...dates,
});
export const invites = pgTable('invites', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: role('role').notNull(),
  tokenHash: text('token_hash').unique().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...dates,
});
export const activityEvents = pgTable('activity_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  action: text('action').notNull(),
  objectType: text('object_type').notNull(),
  objectId: uuid('object_id').notNull(),
  ...dates,
});
export const boards = pgTable('boards', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
});
export const columns = pgTable(
  'board_columns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    sortKey: integer('sort_key').notNull(),
  },
  (t) => [uniqueIndex('board_column_order').on(t.boardId, t.sortKey)],
);
export const tasks = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  columnId: uuid('column_id')
    .notNull()
    .references(() => columns.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  priority: taskPriority('priority').notNull().default('normal'),
  assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  sortKey: integer('sort_key').notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });
export const documentStates = pgTable('document_states', {
  documentId: uuid('document_id')
    .primaryKey()
    .references(() => documents.id, { onDelete: 'cascade' }),
  yjsState: bytea('yjs_state').notNull(),
  savedAt: timestamp('saved_at', { withTimezone: true }).defaultNow().notNull(),
  revision: integer('revision').notNull().default(1),
});
export const githubAccounts = pgTable('github_accounts', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  githubId: text('github_id').notNull(),
  login: text('login').notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  ...dates,
});
export const githubOAuthStates = pgTable('github_oauth_states', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
export const repositories = pgTable('repositories', {
  projectId: uuid('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  repositoryId: text('repository_id').notNull(),
  installationId: text('installation_id').notNull(),
  owner: text('owner').notNull(),
  name: text('name').notNull(),
  defaultBranch: text('default_branch').notNull(),
  connectedBy: uuid('connected_by')
    .notNull()
    .references(() => users.id),
  ...dates,
});
export const codeSessions = pgTable('code_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  branch: text('branch').notNull(),
  baseCommit: text('base_commit').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  ...dates,
});
export const codeFiles = pgTable(
  'code_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => codeSessions.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    initialContent: text('initial_content').notNull(),
    baseBlob: text('base_blob'),
    mode: text('mode').notNull().default('100644'),
  },
  (t) => [uniqueIndex('code_file_session_path').on(t.sessionId, t.path)],
);
export const codeStates = pgTable('code_states', {
  fileId: uuid('file_id')
    .primaryKey()
    .references(() => codeFiles.id, { onDelete: 'cascade' }),
  yjsState: bytea('yjs_state').notNull(),
  revision: integer('revision').default(1).notNull(),
  savedAt: timestamp('saved_at', { withTimezone: true }).defaultNow().notNull(),
});
export const codeSuggestions = pgTable('code_suggestions', {
  id: uuid('id').defaultRandom().primaryKey(),
  fileId: uuid('file_id')
    .notNull()
    .references(() => codeFiles.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id),
  title: text('title').notNull(),
  baselineHash: text('baseline_hash').notNull(),
  beforeContent: text('before_content').notNull(),
  proposedContent: text('proposed_content').notNull(),
  status: text('status').notNull().default('pending'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  ...dates,
});
export const codeComments = pgTable('code_comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => codeSessions.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id),
  body: text('body').notNull(),
  ...dates,
});

export const projectFiles = pgTable('project_files', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  storageKey: text('storage_key').notNull().unique(),
  storageProvider: text('storage_provider').notNull(),
  version: integer('version').notNull().default(1),
  officeKey: uuid('office_key').notNull().defaultRandom(),
  officeSavedKey: uuid('office_saved_key'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  ...dates,
});
export const projectFileVersions = pgTable(
  'project_file_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => projectFiles.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    size: integer('size').notNull(),
    storageKey: text('storage_key').notNull().unique(),
    storageProvider: text('storage_provider').notNull(),
    ...dates,
  },
  (table) => [uniqueIndex('project_file_version_number').on(table.fileId, table.version)],
);

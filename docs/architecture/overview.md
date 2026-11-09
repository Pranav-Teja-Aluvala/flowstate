# FLOWSTATE architecture

The implementation follows Chapter 1 of the supplied FLOWSTATE blueprint and the confirmed 3–5 day schedule. Next.js serves the UI, authenticated server reads, and Server Actions. Hocuspocus runs as a separate Node process. Both use Drizzle and PostgreSQL. No job queue is needed for manual invitation links.

The database owns identity, workspace relationships, projects, boards, tasks, metadata, and binary Yjs states. The collaboration process owns loaded Yjs documents and ephemeral awareness. Clients never write document JSON as a persistence source.

Document authentication uses a 60-second HMAC ticket bound to a session hash and document ID. Ticket expiry governs room admission; the underlying seven-day session is checked continuously. Authorization joins sessions, users, memberships, projects, and document metadata. Live role changes disconnect affected rooms within a two-second polling window.

Before applying an inbound sync update, the service merges it with persisted binary history in a database transaction under a document advisory lock. A temporary Yjs document validates the bytes. An 8 MiB cap rejects further growth. Hocuspocus load/store hooks provide restoration and follow-up stores. A single instance is required for live synchronization; persistence locks alone do not distribute live updates.

Kanban uses relational concurrency: lock a board, verify the task version and source/target board, then renumber affected columns and record an audit event in the same transaction. Selection controls and up/down buttons provide a keyboard alternative to pointer drag and drop.

Scope limits: permissions are workspace-based, not document-specific overrides. Comments and snapshots from the proposed schema are not implemented product features. REST route shapes in the source are suggestions; mutations here use Server Actions.

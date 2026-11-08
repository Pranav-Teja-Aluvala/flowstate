# Security model and review boundaries

All workspace reads and writes require current membership. Viewer writes fail at the server even if a client forges a form. Owner/admin membership management is distinct from editor content capabilities. Only owners can appoint admins or manage existing admins. Owner memberships cannot be removed or reassigned in the MVP. Owner deletion requires typing the workspace name.

Passwords use bcrypt cost 12 with a 12-character minimum and 72-byte maximum. Sessions use random 32-byte tokens, SHA-256 token hashes in PostgreSQL, seven-day expiry, HTTP-only SameSite=Lax cookies, and production Secure flags. Logging out deletes the session row. Authentication attempts are limited per normalized email in persisted 15-minute windows. No email verification, password recovery, MFA, or global abuse gateway is implemented.

Invitations are bound to the recipient email, contain a random token whose hash is stored, expire after 48 hours, and are consumed under a transaction lock. Reusing an invitation does not alter membership. Administrators cannot create admin invitations.

The WebSocket HTTP upgrade checks an exact Origin allowlist. Room admission checks the ticket signature and expiry plus the live database session and document membership. Membership is inherited through the project and workspace. Viewer connections are read-only at the synchronization layer, regardless of client UI. Checks occur on every inbound message and at two-second intervals on idle connections. That polling interval is an explicit revocation bound, not instantaneous invalidation of already delivered content.

Inbound WebSocket messages are limited to 1 MiB and persisted merged document history to 8 MiB. Binary updates commit before protocol acknowledgement. UI content is rendered through Tiptap schema nodes; links restrict protocols and do not insert arbitrary HTML. Awareness names/colors are rewritten from authenticated server identity. Presence is not stored in document_states.

Deploy behind HTTPS/WSS termination and configure only the actual browser Origins. Keep shared signing secrets and database credentials in deployment secrets. Routine logs do not include tokens or document contents. Next.js Server Actions provide framework Origin checks for form mutations; the ticket endpoint is a no-store authenticated read.

Not independently audited. No load test, external penetration test, or production backup restore has been performed. Before public deployment, verify container execution, data restoration, connection/resource ceilings, deployment abuse controls, secret rotation, and TLS configuration. See tests for the controls that are actually exercised.

Next.js development request logging, Server Function argument logging, and browser-to-terminal log forwarding are explicitly disabled. Collaboration storage errors are replaced with safe messages before they reach hook logging, so SQL parameters and binary content are not included in those diagnostics.

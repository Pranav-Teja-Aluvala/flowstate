# Use two application services and PostgreSQL

Status: accepted for the local MVP.

Use Next.js for the web application and metadata mutations, Hocuspocus for WebSocket editing, Drizzle for relational persistence, and PostgreSQL for both metadata and binary document history. These are options explicitly permitted by the supplied plan.

Redis and BullMQ would add operations without serving a current background task. Invitation links are created synchronously and shared manually. Extract a shared UI package only when there is a second consumer. Use real project-local PostgreSQL during development when Docker is unavailable; keep the ordinary database protocol and schema.

Tradeoff: this design supports one live collaboration instance. Horizontal fanout and durable notifications require a later design decision and new failure tests. Database merges protect content storage but do not substitute for distributed live synchronization.

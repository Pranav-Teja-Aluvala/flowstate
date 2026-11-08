# Local operation and deployment preparation

Follow README environment setup. The web service reads apps/web/.env.local. Migrations and collaboration read root .env. Both must point to the same PostgreSQL database and use the same signing secret. Run db:local in one terminal, apply db:migrate, then run dev and dev:collaboration in separate terminals. Stop services with Ctrl+C. Local database data persists under .local/postgres.

To use a remote PostgreSQL database, set DATABASE_URL in both environment files and skip db:local. Use the provider’s TLS connection configuration. Do not share passwords in chat or commit environment files.

For a demo, create two accounts in independent browser profiles. Invite one email as editor, accept the invitation while signed in to that email, and open the same document in both profiles. Use a viewer invitation or role change to show read-only behavior. The tests create clearly fictional workspace content for screenshots.

For a local reset, prefer a new empty database and rerun migrations. A reset permanently removes application data; do not reset a shared or production database. No automatic destructive reset script is provided.

## Backup and restoration

Use PostgreSQL tools matching the deployed major version and a protected backup location. The following are operational examples, not a completed restore drill:

```sh
pg_dump --format=custom --file=flowstate-backup.dump "$DATABASE_URL"
# Restore into a newly created empty database, never over the live demo:
pg_restore --no-owner --dbname="$RESTORE_DATABASE_URL" flowstate-backup.dump
```

After restoring, point both services to the restored database, log in, and open documents to verify binary content and workspace access. Check task order and membership events. Keep backups encrypted and restrict access; backups contain password hashes, session hashes, and workspace content.

Collaboration recovery is exercised automatically by the integration test: save concurrent updates, destroy the server, create a new server, and reconnect using a fresh Yjs document. This is distinct from a database backup/restore drill. Run the test suite against a disposable database only.

## Deployment

Use Docker Compose on a Docker-enabled machine, or deploy Next.js and Hocuspocus separately alongside managed PostgreSQL in one region. Apply migrations in a release step. Set the public WebSocket URL at Next.js build time. Configure HTTPS/WSS, exact allowed browser Origins, production credentials, database backups, process restarts, health checks, and resource monitoring.

The repository includes container-build CI jobs but no verified hosted deployment. No domain, cloud provider, alerting service, or fake deployment URL has been selected.

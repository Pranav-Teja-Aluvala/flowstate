# Local development

Use Node.js 24. Run commands from the repository root. The optional local
PostgreSQL helper keeps its data in `.local/postgres`; stopping it preserves data.

1. Run `npm ci`.
2. Copy `.env.example` to `.env` and `apps/web/.env.example` to
   `apps/web/.env.local`. Existing instances should preserve their current files.
3. Set the **same** `DATABASE_URL` and a random `COLLABORATION_SECRET` of at least
   32 characters in both files. Generate a secret with
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
   Keep it out of Git and chat. The example database URL is for loopback
   development only. For a new local database, replace its example password;
   preserve the password for an existing database.
4. If you have no PostgreSQL server, run `npm run db:local` and keep it running.
   Otherwise point both environment files at your existing database.
5. Run `npm run db:migrate`. This applies pending SQL migrations; it does not
   reset existing workspaces.
6. In separate terminals run `npm run dev` and `npm run dev:collaboration`.
7. Open [localhost:3000](http://localhost:3000), create an email/password account,
   create a workspace and invite a teammate using a generated invitation link.

Core projects, boards and native collaborative documents need no GitHub credentials.
GitHub access and terminal execution have separate [GitHub](github-setup.md) and
[runner](code-workspace.md) setup instructions. Docker/WSL installation is not
performed by these native development commands.

For tests, install Chromium with `npx playwright install chromium`, then use the
commands in the README. PostgreSQL must be running. Tests use synthetic accounts
and remove the temporary workspaces they explicitly own; they do not reset the
database. Local browser tests can also leave synthetic account records from the
full registration flows.

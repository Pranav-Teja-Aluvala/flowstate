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

Core projects, boards, native Word/Excel/PowerPoint/PDF creation and public
repository copies need no GitHub App or Office credentials. GitHub access, Office-file editing and terminal execution have
separate [GitHub](github-setup.md), [Office](office-editing.md) and
[runner](code-workspace.md) setup instructions. Docker/WSL installation is not
performed by these native development commands.

For tests, install Chromium with `npx playwright install chromium`, then use the
commands in the README. PostgreSQL must be running. Tests use synthetic accounts
and remove the temporary workspaces they explicitly own; they do not reset the
database. Local browser tests can also leave synthetic account records from the
full registration flows.

For the public-page audit, run `npm run build`, start the production server with
`npm run start -- --port 3004`, then run `npm run audit:site`. Reports are saved
under the ignored `.local/audits` directory. Use `AUDIT_URL` to select another
production origin. Set `PRIVACY_CONTACT_EMAIL` in the web environment to publish
the instance's privacy contact before accepting public users.

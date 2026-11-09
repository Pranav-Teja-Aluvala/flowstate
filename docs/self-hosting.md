# Self-host FLOWSTATE

These instructions describe operating an authorized FLOWSTATE instance. The current public revision is not offered under an open-source license; see the repository LICENSE. The core includes accounts, workspaces, projects, boards and collaborative documents. It needs no GitHub App, cloud database account or FLOWSTATE subscription. You operate the instance and own its data. Server, domain and infrastructure costs depend on your choices.

## Start on your computer

Install Node.js 24 and Docker Engine with Compose v2 (Docker Desktop using Linux containers on Windows). Download the source, open a terminal in its folder, then run:

```sh
npm run selfhost
```

The helper generates private instance credentials in `.env.selfhost`, builds the application, starts PostgreSQL, applies migrations and starts web and collaboration services. Open http://localhost:3000 and create your account and workspace. The first build takes time; startup output does not guarantee services are healthy yet.

No host `npm ci` is needed for this command: dependency installation happens during the container build. For configuration only, use `npm run setup`. For prerequisite checks use `npm run doctor`.

If development already occupies the default ports, start a fresh instance with:

```sh
npm run selfhost -- --port 3100 --sync-port 1334
```

The helper preserves existing configuration and rejects conflicting flags. Existing development `.env`, `.env.local` and `.local/postgres` are untouched. The container database is a separate instance; existing development data is not automatically imported.

```sh
npm run selfhost:logs
npm run selfhost:stop
```

Stopping keeps the database volume. Keep `.env.selfhost` private and backed up: its encryption key is needed to decrypt optional GitHub credentials. Do not rotate the database password merely by regenerating this file. Do not use `docker compose down -v` unless you intend to delete persistent data.

## Run on your own server

On a fresh checkout with no `.env.selfhost`, run:

```sh
npm run selfhost -- --domain workspace.example.com
```

Replace the example with your own domain. Point its DNS at your server and allow inbound TCP ports 80 and 443. Public mode adds Caddy for HTTPS and same-origin WebSocket routing. PostgreSQL is internal; application service ports bind to loopback. Certificates require working public DNS and network access; the helper does not verify those conditions. See [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).

To convert an existing local instance, preserve all credentials and edit `.env.selfhost`: set `FLOWSTATE_MODE=public`, `FLOWSTATE_DOMAIN` to your domain, `APP_URL` and `ALLOWED_ORIGINS` to its HTTPS origin, `NEXT_PUBLIC_COLLABORATION_URL=wss://YOUR_DOMAIN/collaboration`, and `COOKIE_SECURE=true`. Run `npm run selfhost` to rebuild the browser configuration.

Before opening an instance to others, review the [security model](security/model.md) and [operations runbook](runbook.md). Registration is open; there is no email verification or password recovery service. Do not present the application as enterprise security certified.

## Back up and update

For local mode, create a database archive inside the container and copy it out (avoids binary shell redirection differences):

```sh
docker compose --project-name flowstate --env-file .env.selfhost -f docker-compose.yml exec -T postgres pg_dump -U flowstate -d flowstate -Fc -f /tmp/flowstate-backup.dump
docker compose --project-name flowstate --env-file .env.selfhost -f docker-compose.yml cp postgres:/tmp/flowstate-backup.dump ./flowstate-backup.dump
```

Keep that archive and `.env.selfhost` securely off the application host. Uploaded project files live in the separate `file-data` volume; back up that volume too, because the database archive only includes file metadata. Test restoration against a separate instance before relying on a backup. For public mode add `-f compose.public.yml` to Compose commands. If you changed `COMPOSE_PROJECT_NAME`, use that name in place of `flowstate`.

Before updating, back up both items, review migration changes, then update the source and run `npm run selfhost`. Setup preserves credentials; migrations apply during startup. Database changes may require a restoration plan rather than simply reverting source code.

## Optional integrations

GitHub integration is optional. An operator who enables repository activity, collaborative source editing and pull requests configures their own selected-repository GitHub App using [the setup guide](github-setup.md). A GitHub App is an integration identity; publishing FLOWSTATE's source on GitHub does not require one.

Code execution is disabled by default (`RUNNER_ENABLED=false`). The separate Docker runner is an advanced setup described in [code workspaces](code-workspace.md); it is not included in the core Compose stack. Enable `RUNNER_ENABLED=true` only after configuring its reachable internal HTTP and browser WebSocket endpoints. Never expose a Docker socket through the web application.

## Verification limits

Configuration generation and preservation are covered by automated tests. Docker was unavailable on the development machine, so container startup, Caddy certificates and actual terminal execution still require verification on a Docker-equipped machine. GitHub browser tests use fixtures; real GitHub App activation remains an operator step.

# Shared code and local Docker execution

Self-hosted core instances disable execution by default. Set `RUNNER_ENABLED=true` in the web service environment only after configuring the separate runner and its internal HTTP and browser WebSocket endpoints. GitHub integration is optional for projects, boards and documents.

The code workspace is an extension requested after the original FLOWSTATE document-and-Kanban MVP. It adds repository activity, branch-based code sessions, CodeMirror/Yjs source editing with presence, PR publishing, and an xterm terminal connected to a separate Docker runner process.

## Start the local runner

Install and start Docker Desktop with Linux containers. The current development machine did not have Docker available, so actual container execution is not yet verified. Keep the web and collaboration services running normally, configure GitHub as described in [GitHub setup](github-setup.md), then:

```sh
docker build -t flowstate-runner:local -f infra/docker/runner.Dockerfile .
npm run dev:runner
```

The runner listens on loopback port 1236. Its health endpoint returns 503 until Docker is reachable and the configured image exists. The browser displays setup feedback rather than falling back to executing code on the host.

Root `.env` is used by the runner. It needs the same `DATABASE_URL`, `COLLABORATION_SECRET`, `GITHUB_TOKEN_KEY`, and GitHub client credentials as the other services. Optional settings:

| Variable                 | Default                                             | Purpose                                    |
| ------------------------ | --------------------------------------------------- | ------------------------------------------ |
| `RUNNER_PORT`            | `1236`                                              | Local runner HTTP/WebSocket port           |
| `RUNNER_IMAGE`           | `flowstate-runner:local`                            | Operator-selected trusted image            |
| `DOCKER_SOCKET_PATH`     | Windows Docker named pipe or `/var/run/docker.sock` | Host Docker Engine connection              |
| `RUNNER_INTERNAL_URL`    | `http://127.0.0.1:1236`                             | Web server’s runner-health connection      |
| `NEXT_PUBLIC_RUNNER_URL` | `ws://localhost:1236`                               | Browser WebSocket URL, set before building |

Use the host development workflow for local execution. The existing Compose file runs the core web/collaboration/database services; it does not mount the Docker socket into the web container or automatically expose a host runner to containers. A deployed runner needs a separate protected network and hosting design. Do not expose this local runner publicly.

## Working with code

Create a code session from a branch in **Code & GitHub**. A session is pinned to a commit. Open regular UTF-8 files up to 256 KiB; open files become shared Yjs buffers stored separately from rich-text documents. Authorized editors can change these buffers together. Local code buffers do not modify GitHub until a user explicitly publishes a PR.

Select **Start terminal** to materialize the repository at the session commit, overlay saved shared buffers, and start a shell inside a new container. Run Node.js/Python commands there. Other authorized members can join the same terminal; viewers can watch an existing terminal but cannot start it or send input. Use **Sync saved files** after source edits to update the container, then run the command again. Terminal filesystem changes are ephemeral and are not imported into shared buffers or published to GitHub. Stop workspace destroys the container; disconnecting a tab only disconnects that client.

The base image has Node.js, npm, Python, and Git. Runtime networking is disabled, so dependency downloads, remote services, package installs, and application previews are not available by default. For repositories requiring dependencies, an operator must prepare a trusted image with dependencies available without network access. This initial runner supports regular repositories up to 500 files, 1 MiB per file and 20 MiB total; it refuses truncated trees, symlinks, and submodules. It is not a general replacement for Codespaces.

## Boundaries and controls

- Every connection requires a signed, purpose-bound, short-lived ticket, a live FLOWSTATE session, project membership, and the user’s GitHub repository access.
- Local roles/session expiry are checked on messages and during two-second idle polling. GitHub permission checks are cached for up to 30 seconds; the cache key includes repository identity and GitHub identity.
- Containers run as UID/GID 1000, with a read-only root filesystem, no host mounts, no Docker socket, no GitHub tokens or database credentials, no networking, all capabilities dropped, and `no-new-privileges`.
- Per-container limits: one CPU, 512 MiB memory, 128 processes, bounded tmpfs filesystems, and a 30-minute parent-process lifetime. The runner permits at most four active workspaces in a process. A disconnected workspace is removed after a one-minute idle period.
- Code is fetched by the authenticated runner service and copied into the container. No repository URL containing credentials is passed into shell commands. Commands run through Docker’s exec stream, never a host shell.
- Terminal output stays in a bounded in-memory buffer; it is not saved to application logs. Message queues and outbound buffers are bounded. Nothing is silently executed from a checked-out repository during initialization.

Docker is an isolation boundary with a shared host kernel, not a claim of safe public multi-tenant execution or an independent security audit. Source content is stored in PostgreSQL and local container memory; use protected disks/database backups. Credential encryption does not imply end-to-end encryption of company source. A future hosted runner should provide a stronger tenancy boundary and a reviewed network policy.

## Run the checks

```sh
npm run test
npm run test:e2e
npm run build
npm run test:code
```

The code browser test runs the production build on port 3001 and an isolated collaboration process on port 1238 with a test-only mocked GitHub transport. It confirms two real browser editors synchronize, viewers cannot write, saved code becomes the PR snapshot, the base branch is not targeted, and missing runner infrastructure produces a clear error. A passing fixture test is not a successful live GitHub installation or Docker run.

Before presenting execution as verified, start Docker, build the image, connect an actual repository, run a file from two terminal clients, check resource/network behavior, revoke one member, and confirm stopped/expired containers are removed. Live provider and Docker checks remain outstanding on this machine.

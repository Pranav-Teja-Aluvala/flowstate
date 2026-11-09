# Verification record

## Stable branch maintenance — 09 November 2026

The maintenance tree passed 30 unit/integration tests, four core browser flows,
the isolated GitHub browser flow, TypeScript, lint, formatting and a production
build against the existing local PostgreSQL instance. Dialog drafts survive
validation failures. Docker snapshot transfer now uses non-root tar extraction
into tmpfs while keeping the root filesystem read-only; terminal streams use
correct Docker framing. The Docker CI rerun must confirm this backport.
CRLF repository text is normalized to LF in shared buffers and restored to its
original uniform CRLF style on an edited GitHub publish. Integration fixtures
include Windows line endings. No Docker/WSL was installed locally and no
application data was reset.

## Project file library — 09 November 2026

30 unit/integration tests and all four core browser flows passed. The new browser flow covers original-byte download, viewer read access, blocked viewer/outsider writes, blocked cross-origin upload, invalid PDF signatures, project quota enforcement and immediate membership-revocation denial. Type checking, linting, formatting and the production build passed. The Supabase adapter has mocked HTTP coverage, not live provider verification. Migration 0004 was applied to the local PostgreSQL instance. No Docker, WSL, paid hosting or public runner was activated; Docker setup was deferred at the owner's request.

## Self-hosted distribution update — 09 November 2026

All 24 unit/integration tests passed, including independent credential generation, configuration preservation, custom ports, public URLs and invalid-input rejection. Type checking, linting, formatting and the production build passed. The code browser test passed using mocked GitHub transport, including the explicitly enabled but unavailable runner path. Setup was executed twice locally and preserved its existing configuration. Doctor correctly reported Docker missing.

Docker/Compose startup, public HTTPS certificate issuance and actual container execution were not run locally. CI now includes Compose configuration validation and an image check that private `.env.selfhost` configuration is excluded; those new CI steps have not been executed remotely. The source remains local until published to a public repository.

## Earlier application verification

Environment: Windows, Node.js 24.18.0, real project-local PostgreSQL 18, Chromium through Playwright. Executed 08 November 2026. Test accounts and content are synthetic fixtures created by the actual application flows.

| Check                                                | Result                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| Generated SQL migrations applied to PostgreSQL       | Passed                                                        |
| ESLint                                               | Passed                                                        |
| Strict TypeScript, web/collaboration/runner services | Passed                                                        |
| Next.js production build                             | Passed                                                        |
| Vitest unit/integration suite                        | 20 tests passed                                               |
| Playwright foundation flow                           | Passed                                                        |
| Playwright board and two-user editor flow            | Passed                                                        |
| Production dependency audit                          | Zero reported vulnerabilities                                 |
| Full development dependency audit                    | 12 moderate findings in migration/lint tool dependency chains |
| Docker Compose / container execution                 | Not run; Docker unavailable locally                           |
| Remote GitHub Actions                                | Configured; not run remotely                                  |
| Database backup/restore drill                        | Documented; not executed                                      |
| Load, latency, horizontal scaling                    | Not benchmarked                                               |

Unit tests verify role capabilities, project validation, and bcrypt byte limits. Protocol integration tests use an actual Hocuspocus instance and PostgreSQL to verify concurrent updates, fresh-client recovery after server destruction/recreation without duplicate content, viewer write rejection, transient reconnection, hostile Origin rejection, invalid/expired tickets, revocation, payload size limits, and expired underlying sessions.

Browser flows cover registration/login/logout, workspace and project creation, metadata editing and refresh persistence, invitation email binding, viewer write forgery, workspace isolation, member removal, task assignment/movement, document creation, simultaneous editing by independent accounts, cursor presence, content reload, and active editor-to-viewer changes. Screenshot assertions inspect actual rendered layouts, including the 390-pixel workspace viewport.

The test suites were developed and corrected during implementation. Earlier failures included test navigation timing and cursor labels being compared as document text; final assertions exclude ephemeral labels when checking convergence. Passing tests do not establish production readiness, external audit, every possible concurrency interleaving, or capacity guarantees.

The full npm audit currently flags moderate advisories in development tooling transitives (Drizzle Kit’s legacy esbuild loader and ESLint’s TypeScript/minimatch chain). The production dependency audit is separate. Do not apply forced major downgrades merely to suppress the report; validate a compatible upstream update before changing migration tooling. Recheck audits when installing because advisory data changes.

## User-requested follow-up

The follow-up moves project deletion to settings, adds typed-name confirmation and destructive styling, and closes successful creation dialogs while preserving validation errors. It also adds GitHub App authorization, selected-repository connection, source browsing, CodeMirror/Yjs rooms, explicit branch/PR publishing, and a separate local Docker runner.

Additional checks: credential encryption/tamper rejection, repository path validation, symlink rejection, runner ticket purpose/expiry, container-policy boundaries, private-code room initialization/convergence/restart recovery, unrelated-workspace role isolation, outsider rejection, and GitHub-disconnect revocation. The separate production-browser code test uses artificial accounts and a test-only mocked GitHub API; it verifies file browsing, two-user source editing, PR snapshot construction, viewer restrictions, and unavailable-runner feedback.

Live GitHub authorization/refresh/PR creation and actual Docker execution remain unverified without App credentials and Docker. An opt-in Docker suite is provided as npm run test:docker and configured for remote CI, but has not been executed locally.

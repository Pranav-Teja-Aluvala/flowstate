# FLOWSTATE / Version 2

**Different minds. Shared momentum.**

The creative studio update brings a dark editorial interface to the workspace,
with shared code reviews, editable Office files and a browser terminal workflow.

![FLOWSTATE version 2, running locally](docs/screenshots/workspace-desktop.png)

## What changed

| Update                | What you can do                                                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A new studio**      | Navigate an editorial project list, real task summaries, team notes and live presence.                                                                                                          |
| **Review together**   | Comment on code sessions, suggest changes, approve or reject them, and apply approved suggestions with stale-buffer protection. Owners and admins review; editors propose.                      |
| **Work with files**   | Open DOCX, XLSX, PPTX and PDF through the optional Office engine. Download original files, export saved files as PDF and restore a previous version without discarding the replaced saved file. |
| **Build together**    | Connect an authorized GitHub repository by URL, edit shared source buffers and publish to a new branch and pull request.                                                                        |
| **A useful terminal** | Run code in an isolated local Docker container, review tracked text changes, import them into shared buffers and confirm GitHub publishing in the browser.                                      |
| **Clearer controls**  | Successful dialogs close; failed forms retain their draft. Project deletion stays in settings, with confirmation.                                                                               |
| **Public pages**      | About, Privacy and Terms pages, metadata, a sitemap and explicit search exclusion for private workspace routes.                                                                                 |

![Project board](docs/screenshots/kanban-desktop.png)

![Live document studio](docs/screenshots/editor-desktop.png)

<details>
<summary>Mobile studio</summary>

![Mobile workspace](docs/screenshots/workspace-mobile.png)

</details>

Screenshots show the actual application with synthetic team content.
[Public introduction](docs/screenshots/about-desktop.png) · [Public page on mobile](docs/screenshots/about-mobile.png)

## Try this version

Requires Node.js 24 and PostgreSQL. Use the [local development instructions](docs/local-development.md)
or the [Docker setup](docs/self-hosting.md). Existing instances must apply migrations
through **0008** before starting version 2.

```sh
npm ci
npm run db:migrate
npm run dev
# In another terminal:
npm run dev:collaboration
```

Open [localhost:3000](http://localhost:3000). The public introduction is at
[/about](http://localhost:3000/about). Copy `.env.example` and configure local
credentials first; the setup guide explains both native and container options.

GitHub, Office editing and terminal execution each need their configured services:
[GitHub setup](docs/github-setup.md) · [Office setup](docs/office-editing.md) ·
[Code and terminal setup](docs/code-workspace.md).

## Verification

The release uses TypeScript, ESLint, Vitest, Playwright, PostgreSQL-backed integration
tests, real Docker runner tests and a real ONLYOFFICE CI job. See the
[execution evidence and limits](docs/verification.md) for exact results.

The local production audit of `/about`, `/privacy` and `/terms` measured **100 SEO,
100 accessibility and 100 best practices**, with **98–99 performance**. Axe reported
zero WCAG A/AA violations on those pages. These are measurements from this build,
not a guarantee for every host or a claim that private pages should be indexed.

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run test:e2e
npm run test:code
npm run test:office
# With the production web server running on port 3004:
npm run audit:site
```

## Before demonstrating

- Email/password accounts and manually shared invitation links are implemented. Email delivery, verification and password reset need a separate provider.
- Office files save back after all editors close. Export uses the saved version; close editors and wait first. Original uploads, saved versions and PDF exports are limited to 4 MiB; file history shares the 100 MiB project quota.
- Suggestions support existing text files up to 64 KiB. Reviews are an optional workflow alongside live editing, not an enforced GitHub merge policy. Pause editing while applying a suggestion; conflicting live edits need a fresh review.
- The terminal supports tracked UTF-8 file imports, not new/deleted files or arbitrary packages requiring internet. Docker is required for execution.
- Actual GitHub App credentials, hosted storage and Sentry delivery are not activated in the local demo. No paid hosting was purchased. AI is deferred by choice.

This is a **public-source portfolio project**, not an open-source contribution
program. See [LICENSE](LICENSE), [privacy policy](apps/web/src/app/privacy/page.tsx)
and [project feedback](CONTRIBUTING.md). Earlier MIT-licensed copies retain their
original rights; dependencies keep their own licenses.

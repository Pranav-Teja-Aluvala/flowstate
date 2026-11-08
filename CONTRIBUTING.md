# Contributing to FLOWSTATE

Open an issue describing the problem and expected behavior before proposing a large change. Keep pull requests focused and include reproduction steps and relevant test results.

Test requested changes before committing them. Use short, plain commit messages describing the user-facing change, such as “Fix board creation dialog” or “Add shared project files”. Avoid long technical summaries in commit titles.

Use Node.js 24 and follow the README setup. Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and `npm run test:e2e` against a disposable PostgreSQL database. Browser tests create demo accounts and workspaces; integration tests remove their own fixtures.

Schema changes require `npm run db:generate` and a committed migration. Never change a migration already applied to a shared database. Document a forward fix or rollback plan. Preserve binary Yjs history, server authorization, and the distinction between awareness and durable content.

Include actual screenshots for visible UI changes. Never commit `.env` files, invite links, session tokens, or real workspace contents.

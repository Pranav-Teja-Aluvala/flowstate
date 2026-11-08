# FLOWSTATE version 2 — execution record

Version 2 is being built on the `version-2` branch. This file separates implemented source, executed tests and external activation requirements. The published `main` history must not be replaced until the version 2 release is ready.

## Confirmed direction

Keep all existing workspaces, boards, documents, invitations, role checks, durable Yjs collaboration, project files and GitHub code sessions. Add team notes, Office-file editing, a useful browser terminal/Git workflow and optional error tracking. Keep the selected ₹0 demo budget. Do not install Docker/WSL or buy hosting; their setup was deferred by the owner.

Once functional work is verified, apply the supplied Experimental Creative Studio brief: dark editorial surfaces, restrained acid-lime/orange accents, purposeful motion, accessible contrast and responsive layouts. The frontend redesign is queued after the functional work, as requested.

The owner explicitly requested combining old GitHub commits into a clean version 2 history after the release is ready. Before that rewrite, create a local recovery ref, inspect the actual remote head, and use an expected-head lease. Do not delete application data or strip tests/security controls as part of repository cleanup.

## Implemented in this branch

- Workspace team notes with author/time metadata, server-enforced write permissions and a recent-activity feed derived from actual stored events.
- Task priorities (low, normal, high, urgent) and task deletion with confirmation, workspace authorization and stale-version checks.
- Optional ONLYOFFICE integration for uploaded DOCX/XLSX/PPTX/PDF files. Signed configurations enforce viewer/editor modes; source tickets bind file/session/key and expire. Signed final-save callbacks validate the current file key, editor membership, original file format, configured cache origin and project quota. Old file bytes remain downloadable as previous versions.
- Runtime review/import for existing tracked UTF-8 files, capped at 20 files/512 KiB. Shared-buffer hashes detect stale terminal snapshots; imports travel through the authenticated collaboration service and wait for durable acknowledgement. Sync refuses to overwrite unimported terminal work.
- A container CLI (`flowstate status`, `flowstate diff`, `flowstate push "Short message"`). Push queues a browser review; it never receives GitHub credentials or silently publishes. Reviewed shared buffers are published through the existing new-branch/pull-request flow. Container Git history is local and ephemeral, not a clone of the remote history.
- Optional Sentry error reporting, inactive without DSNs. SDK collection settings disable user/request/body/query/database-content capture. The final event filter preserves stack locations and removes messages, source context, requests, user data, breadcrumbs and arbitrary extras. Traces, replay and log delivery are not enabled.

## Verification boundary

Office transport tests use a clearly labelled service fixture. They verify configuration, signed source access, save-back bytes, previous versions, duplicate callbacks and revocation; they do not establish real Office format fidelity or two-user Office-engine behavior. Docker CLI/terminal execution, actual GitHub App activation, hosted Supabase/Vercel and live Sentry event delivery still require external services. They must not be described as verified merely because fixture tests pass.

The core Tiptap/Yjs editor and its server-restart persistence remain genuine separate functionality. Office editing is supplied by a separate engine, not by pretending the rich-text editor can edit arbitrary Office files.

## Remaining release work

1. Complete all local checks against the current branch and review the new paths for error handling and resource limits.
2. Verify Docker runner startup, CLI review/publish bridge, Office round trips and simultaneous Office editing on a Docker-equipped machine. Check revocation in the actual Office engine: the current browser closes on access changes and the backend rejects revoked writes, but the external engine can retain cached content and a copied valid editor token until its own session rules apply.
3. Activate the selected-repository GitHub App and verify the actual feature-branch/PR workflow with authorized test data.
4. Finish the creative-studio frontend once functional activation/verification is complete. Inspect desktop/mobile, empty/error states, keyboard interaction and reduced motion using actual app screenshots.
5. Refresh README/screenshots/demo evidence, complete release tests, preserve a local recovery ref, then squash the release history and publish version 2 using a remote-head lease.

This expanded work is not yet a completed version 2 release.

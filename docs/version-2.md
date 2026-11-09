# Version 2 delivery record

The owner selected separate branches: `main` remains the polished stable interface;
`version-2` contains the creative-studio frontend and new collaboration features.
The version 2 README describes the update; setup, evidence and technical limits
live in focused documents.

Implemented: dark editorial command center, board and document studio; genuine
presence and task counts; team notes and priorities; code-session discussion and
review suggestions; owner/admin approve, reject and apply controls; existing
tracked-file terminal imports and explicit browser GitHub publishing; optional
Office editing, PDF export and saved-file recovery; optional filtered Sentry;
public About/Privacy/Terms pages, indexing controls and automated site audits.

AI was explicitly deferred by the owner. The budget remains ₹0: no paid hosting
or services purchased. Docker/WSL setup remains deferred on the development machine;
real container and Office-engine verification runs on GitHub Actions.

Reviews are optional alongside live editing, not mandatory merge protection.
Applying a suggestion checks its baseline through the collaboration service. Pause
concurrent editing while applying; already-in-flight edits are not a distributed
transaction. A stale proposal must be recreated against current code.

The owner authorized clean branch histories, with local recovery refs retained
and expected-head leases used for remote replacement. A closed PR remains in
GitHub's audit history; closing it does not delete its record.

See [verification](verification.md), [local setup](local-development.md),
[Office setup](office-editing.md), [code workflow](code-workspace.md) and
[monitoring](monitoring.md). External activation remains required for a real GitHub
App, hosted storage and monitoring delivery. No production deployment is claimed.

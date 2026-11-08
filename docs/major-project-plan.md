# FLOWSTATE major-project direction

Product direction confirmed on 09 November 2026. This is a target specification, not a claim that every feature is implemented.

## User journey

1. Create an account, create a team/workspace and invite teammates with roles.
2. Create a project containing shared notes, documents, uploaded files, boards and a connected GitHub repository.
3. Open a shared note or document and edit together with presence and durable saving.
4. Upload Word, PowerPoint or Excel files and open an embedded editor. Save the original-format file and download it without a manual import/conversion workflow. Evaluate office-engine format fidelity before promising exact preservation.
5. Open PDFs in the workspace. Exact PDF editing scope remains to be confirmed: page annotations/forms and modifying existing text/layout are different capabilities.
6. Connect an authorized GitHub repository, select a branch and collaboratively edit supported code files.
7. Open a browser terminal backed by an isolated execution environment. Review changes, commit and push to a feature branch, then create a pull request. Shared editor buffers and terminal filesystem changes must synchronize reliably before committing.

Users should not install a separate FLOWSTATE CLI. GitHub URLs identify repositories; private repository access still requires authorization. Instance operators configure infrastructure and optional integrations once.

## Hosting proposal

Keep one primary database rather than introducing overlapping backends. Evaluate Vercel for Next.js and Supabase for managed PostgreSQL plus file storage. Preserve the current application authorization model initially instead of simultaneously replacing authentication and all persistence.

The existing Yjs/Hocuspocus service is currently designed for a single long-running WebSocket process. A dedicated host is the lowest-change deployment option. Vercel now documents WebSocket support in public beta, but connections have bounded durations and instances do not share memory; adapting this service would require reconnection and distributed room coordination. The office editor and isolated code runner also need appropriate compute. Their deployment, authentication, callback validation and network boundaries must be designed before public activation.

References: [Vercel WebSockets](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections), [Supabase Storage](https://supabase.com/docs/guides/storage).

Do not add Convex alongside PostgreSQL merely for a realtime label. Adopt it only after choosing a deliberate backend redesign and migration plan. A vector database is unnecessary for the requested workflow; revisit it if semantic search or retrieval is added. Sentry is an optional observability integration, with credentials, document content and terminal output excluded from telemetry.

Hosted deployments and self-hosted open-source distributions can coexist. Do not remove the existing Docker distribution or require a paid cloud account for local core usage.

## Implementation milestones

1. Establish the hosted core: database connection, migrations, deployed collaboration service, secrets, origin checks and a two-user persistence smoke test.
2. Add a project file library: authenticated upload/download, workspace authorization, size/type limits, storage metadata and lifecycle handling.
3. Integrate an office editor after evaluating licensing, deployment needs and representative DOCX/XLSX/PPTX round trips. Confirm PDF capabilities separately.
4. Complete the code workspace: real selected-repository GitHub activation, bidirectional editor/runner synchronization, reviewed Git operations and verified isolated terminal execution.
5. Add error monitoring, backup/restore verification, access-revocation tests, deployment documentation and an evidence-based demo.

## Current implementation boundary

Accounts, workspace membership, projects, boards and collaborative rich-text documents exist. A GitHub/code/terminal extension exists with fixture-based browser coverage. Real GitHub activation and Docker terminal execution remain unverified. Office-file editing, project file storage, full terminal Git workflows and the proposed hosted deployment are new work. The existing rich-text editor must not be described as a Word, PDF, spreadsheet or presentation editor.

Resume statements should describe only completed and verified behavior. This expanded scope replaces the earlier short MVP sprint estimate; it should be delivered in milestones rather than represented as already finished.

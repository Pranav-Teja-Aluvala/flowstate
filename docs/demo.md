# Three minute FLOWSTATE demo

**0:00–0:25 — A place for the team.** Show the workspace and project list. Explain that membership determines what each user can access. Open a project with a board and document.

**0:25–0:55 — The next steps.** Create a task, assign it, move it between columns, and refresh. Show that the position and assignment persist. Mention that relational transactions and versions handle task operations.

**0:55–1:45 — The same page.** Open one document as two different authorized users in independent browser profiles. Type from both, show remote names/cursors and the online collaborator count, and apply a heading and bold formatting. Explain that Yjs carries convergent updates through Hocuspocus, while presence stays ephemeral.

**1:45–2:15 — Content that stays.** Wait for database save feedback. Restart the collaboration process and reload the document. Show the recovery integration test result; explain that PostgreSQL stores binary Yjs history, not JSON converted back into a new document.

**2:15–2:40 — Access that means something.** Change the second user to viewer. Show that the active room closes and reloading produces read-only access. Remove membership and demonstrate that reconnect is rejected.

**2:40–3:00 — The engineering.** Show the architecture diagram, passing verification commands, and the single-instance/undeployed limitations. Close on the specific guarantees tested, without claiming production capacity or an audit.

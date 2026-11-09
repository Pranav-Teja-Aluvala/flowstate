# Office editing

The optional editor service opens PDF, DOCX, XLSX and PPTX uploads in FLOWSTATE. Other supported uploads remain downloadable. The integration uses ONLYOFFICE Docs Community 10.0.0; it does not remove vendor branding. Review the service's [AGPL/trademark licensing](https://helpcenter.onlyoffice.com/docs/installation/community/faq) when distributing or hosting an integrated product. FLOWSTATE's existing license does not replace third-party license obligations.

## Local Compose setup

On a Docker-equipped machine, from the repository root:

```sh
npm run setup:office
npm run selfhost
```

The first command creates or preserves `.env.selfhost` and appends a separate random office JWT secret without rotating existing instance credentials. The normal startup helper then includes `compose.office.yml`. The office endpoint binds to loopback port 8082; it needs substantial disk/RAM and can take time to start. The helper does not install Docker or WSL.

The bundled profile is local-only. Its web service uses `http://office` internally, the editor reaches callbacks/source through `http://web:3000`, and the local browser loads `http://127.0.0.1:8082` while the application uses `localhost`. Different hostnames prevent the browser from sending application cookies to the office service; different ports alone do not isolate cookies. Local private-address access is enabled for internal communication. Do not publish that profile or the document server directly on the internet. A public installation needs a deliberately configured HTTPS office service, origin/network controls and tested callback connectivity.

For host development with an independently running engine, set `OFFICE_JWT_SECRET` in the web service and the matching secret in the engine. Set `OFFICE_PUBLIC_URL` to the browser-reachable origin, `OFFICE_INTERNAL_URL` to the backend-reachable origin, and `OFFICE_APP_URL` to the origin the engine can use to reach FLOWSTATE. Windows Docker commonly uses `http://host.docker.internal:3000` for the last value. These values are server-only; no secret belongs in a `NEXT_PUBLIC_` variable.

## Saving and history

Close **all** editor tabs for a file to trigger a final save. The engine may need several seconds afterward. Force-save callbacks are rejected rather than acknowledged without saving. The interface states this behavior; its connected indicator is not a claim that the latest engine state has reached PostgreSQL/storage.

Successful final saves preserve the prior object/version, store a new original-format object and rotate the editing key. Final callback retries are idempotent. Old versions are downloadable by current workspace members; revoked members lose backend access to current and historical files. The 100 MiB project quota includes retained history. Individual saves stay within 4 MiB. Failed, mismatched-format or over-quota saves keep the previous stored version.

File signature checks are basic checks, not malware scanning or proof of complete format validity. Test representative real files and make backups before trusting fidelity. Orphan storage cleanup and automatic history pruning are not implemented.

## Test commands and limits

```sh
npm run test
npm run build
npm run test:office
```

The Office browser suite uses a transport fixture that labels itself as a fixture. No actual Office-engine editing has been executed on the current machine because Docker/WSL setup was deferred. Browser access polling and backend save authorization are implemented, but strict revocation of a malicious external engine session requires additional engine-side session termination/verification before company-code/document security claims can be made.

API references: [signed outgoing requests](https://api.onlyoffice.com/docs/docs-api/additional-api/signature/request/token-in-header), [save callbacks](https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler), [editor permissions](https://api.onlyoffice.com/docs/docs-api/usage-api/config/document/permissions).

## Version 2 export and recovery

The file studio can close its editor explicitly so final save-back can finish.
PDF export reads the latest saved version. PDF originals download directly;
DOCX/XLSX/PPTX conversion uses the configured engine's signed `/converter` API,
accepts only its configured cache URLs, caps output at 4 MiB and rechecks membership
before returning bytes. A conversion timeout leaves the saved file untouched.

Owners and admins can restore a historical version after exact-name confirmation.
The current saved file is archived, restored bytes are copied into a new storage
object, the version increases and the Office key rotates. Stale callbacks are
rejected. Close all editors and wait for save-back first; unsaved editor content
is not a recovery snapshot. History is retained and counted toward quota.

Real-engine CI has passed four-format opening and two-user Word save-back; see
[the execution record](verification.md). This does not establish fidelity for all
real-world Office files. The final CI run also exercises saved-file PDF conversion.

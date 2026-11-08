# Optional error monitoring

Set server-only `SENTRY_DSN` and, if browser error reporting is desired, the public ingestion DSN `NEXT_PUBLIC_SENTRY_DSN`. Leave both empty to disable reporting. No account or paid plan is required to run FLOWSTATE itself. Sentry activation and actual remote event delivery have not been performed.

The implementation uses the installed Sentry Next.js SDK 11.11.0 and Next.js instrumentation hooks. Its current SDK uses `dataCollection` settings rather than the older `sendDefaultPii` option. User info, headers, cookies, HTTP bodies, query parameters, database query data, local stack variables and source-context lines are disabled. A final allowlist filter returns generic exception text plus stack locations; it drops request/user/context/breadcrumb/extra fields. The filter has an automated private-data omission test.

Logs are dropped, tracing is sampled at zero and session replay is disabled. Source-map upload and Sentry build authentication are not configured. This provides optional error-location reporting, not full observability or a claim that all backend processes are monitored. The separate collaboration and runner services are not wired to Sentry in this milestone.

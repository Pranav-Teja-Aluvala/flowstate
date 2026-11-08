import type { ErrorEvent } from '@sentry/nextjs';
export const monitoringDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  frameContextLines: 0,
};
// Keep location information for debugging, never workspace contents or credentials.
export function sanitizeMonitoringEvent(event: ErrorEvent): ErrorEvent {
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    release: 'flowstate@0.2.0-dev',
    exception: {
      values: event.exception?.values?.map((exception) => ({
        type: 'ApplicationError',
        value: 'Error details withheld for workspace privacy.',
        stacktrace: exception.stacktrace && {
          frames: exception.stacktrace.frames?.map((frame) => ({
            filename: frame.filename?.split(/[?#]/)[0],
            function: frame.function,
            lineno: frame.lineno,
            colno: frame.colno,
            in_app: frame.in_app,
          })),
        },
      })),
    },
  };
}

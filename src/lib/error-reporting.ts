/**
 * Client-side error forwarding.
 *
 * Production React does not rethrow errors caught by an error boundary to
 * `window.onerror`, so boundary failures would otherwise be invisible to the
 * host preview's telemetry. When the host injects its reporting hooks we hand
 * the error over; everywhere else this is a no-op.
 */

type CaptureOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type CaptureException = (
  error: unknown,
  context?: Record<string, unknown>,
  options?: CaptureOptions,
) => void;

type RuntimeErrorHook = (payload: {
  message: string;
  stack?: string;
  filename?: string;
}) => void;

/** Hook names injected by the host preview runtime, resolved dynamically. */
const EVENTS_HOOK = "__lovableEvents";
const RUNTIME_HOOK = "__lovableReportRuntimeError";

function hostHooks() {
  const scope = window as unknown as Record<string, unknown>;
  const events = scope[EVENTS_HOOK] as { captureException?: CaptureException } | undefined;
  const runtime = scope[RUNTIME_HOOK] as RuntimeErrorHook | undefined;
  return { events, runtime };
}

/** Turns any thrown value into a readable one-line message. */
function describe(error: unknown): string {
  if (error instanceof Response) {
    // Loaders and server fns commonly throw a raw Response; String(it) is the
    // opaque "[object Response]", so surface status and URL instead.
    return `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export function reportClientError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const { events, runtime } = hostHooks();

  events?.captureException?.(
    error,
    {
      source: "react_error_boundary",
      route: window.location.pathname,
      ...context,
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );

  const stack = error instanceof Error ? error.stack : undefined;
  runtime?.({
    message: describe(error),
    ...(stack !== undefined && { stack }),
    filename: window.location.pathname,
  });
}

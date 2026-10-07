/**
 * Auth.js logger. Errors are logged by type, plus the name and code of the wrapped
 * error (e.g. a PostgreSQL SQLSTATE): never a message, a stack, the profile, tokens or
 * the submitted credentials, which some messages and causes carry.
 */
export function logAuthError(error: Error): void {
  const type = "type" in error && typeof error.type === "string" ? error.type : error.name;
  const inner = wrappedError(error);
  const detail = inner === undefined ? "" : ` (${[inner.name, codeOf(inner)].filter(Boolean).join(" ")})`;
  console.error(`[auth] ${type}${detail}`);
}

export function logAuthWarning(code: string): void {
  console.warn(`[auth] warning ${code}`);
}

/** Auth.js wraps the original error as `cause.err`. */
function wrappedError(error: Error): Error | undefined {
  const cause: unknown = error.cause;
  if (typeof cause === "object" && cause !== null && "err" in cause && cause.err instanceof Error) {
    return cause.err;
  }
  return undefined;
}

function codeOf(error: Error): string {
  return "code" in error && typeof error.code === "string" ? error.code : "";
}

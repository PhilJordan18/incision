/**
 * Auth.js logger. Errors are logged by type, plus the name and code of the wrapped
 * error (e.g. a PostgreSQL SQLSTATE): never a message, a stack, the profile, tokens or
 * the submitted credentials, which some messages and causes carry. The one exception is
 * the OAuth library's own checks (codes `OAUTH_*`): their messages are fixed sentences
 * naming the failed check, never a value, and the code alone does not say which check.
 */
export function logAuthError(error: Error): void {
  const type = "type" in error && typeof error.type === "string" ? error.type : error.name;
  const inner = wrappedError(error);
  const code = inner === undefined ? "" : codeOf(inner);
  const detail = inner === undefined ? "" : ` (${[inner.name, code].filter(Boolean).join(" ")})`;
  const check = inner !== undefined && OAUTH_CHECK_CODE.test(code) ? `: ${inner.message.slice(0, 160)}` : "";
  console.error(`[auth] ${type}${detail}${check}`);
}

/** Codes of oauth4webapi's validation errors, e.g. OAUTH_INVALID_RESPONSE. */
const OAUTH_CHECK_CODE = /^OAUTH_[A-Z_]+$/;

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

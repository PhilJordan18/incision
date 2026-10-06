import { parse } from "pg-connection-string";

/**
 * True when pg will connect with TLS and verify the server certificate and host name.
 * Uses pg's own parser, so duplicated parameters (`sslmode=verify-full&sslmode=disable`)
 * or `uselibpqcompat` are judged exactly as pg will apply them; libpq-compatible modes
 * that skip the host name check replace `checkServerIdentity` and are refused.
 */
export function usesVerifiedTls(connectionString: string): boolean {
  try {
    const { ssl } = parse(connectionString);
    if (ssl === true) {
      return true;
    }
    if (typeof ssl !== "object" || ssl === null || ssl.rejectUnauthorized === false) {
      return false;
    }
    // Not in pg-connection-string's types, but set at runtime by its libpq-compatible modes.
    return !("checkServerIdentity" in ssl && typeof ssl.checkServerIdentity === "function");
  } catch {
    return false;
  }
}

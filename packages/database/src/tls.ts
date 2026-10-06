import { parse } from "pg-connection-string";

/**
 * True when pg will connect with TLS and verify the server certificate. Uses pg's own
 * parser, so duplicated parameters (`sslmode=verify-full&sslmode=disable`) or
 * `uselibpqcompat` are judged exactly as pg will apply them.
 */
export function usesVerifiedTls(connectionString: string): boolean {
  try {
    const { ssl } = parse(connectionString);
    if (ssl === true) {
      return true;
    }
    return typeof ssl === "object" && ssl !== null && ssl.rejectUnauthorized !== false;
  } catch {
    return false;
  }
}

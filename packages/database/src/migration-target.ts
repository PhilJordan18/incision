import { parse } from "pg-connection-string";
import { isLocalDatabase } from "./local-database";
import { usesVerifiedTls } from "./tls";

/**
 * Refuses a migration target that is pooled or, when remote, without verified TLS.
 * Uses pg's own parser, so `?host=` cannot make a remote server look local.
 */
export function assertMigrationTarget(connectionString: string): void {
  // pg keeps the host's case; DNS does not care.
  const host = (parse(connectionString).host ?? "").toLowerCase();
  // A transaction pooler would keep the session advisory lock on a shared backend.
  if (host.includes("-pooler")) {
    throw new Error("DATABASE_URL_UNPOOLED points to a pooled endpoint; use the direct Neon URL");
  }
  if (!isLocalDatabase(connectionString) && !usesVerifiedTls(connectionString)) {
    throw new Error("DATABASE_URL_UNPOOLED must use verified TLS (sslmode=verify-full) for a remote database");
  }
}

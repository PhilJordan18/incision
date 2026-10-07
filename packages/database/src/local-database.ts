import { parse } from "pg-connection-string";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * True when pg connects to this machine over TCP, judged with pg's own parser so that
 * `?host=` cannot make a remote server look local. Nothing then crosses the network,
 * so TLS is not required (local Docker, CI service container).
 */
export function isLocalDatabase(connectionString: string): boolean {
  try {
    return LOCAL_HOSTS.has((parse(connectionString).host ?? "").toLowerCase());
  } catch {
    return false;
  }
}

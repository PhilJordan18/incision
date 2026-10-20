/** Only a literal IPv4 loopback is accepted: no DNS, aliases, query overrides or remote URL. */
export function localAdminUrl(value: string): string {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== "127.0.0.1" ||
      url.pathname !== "/postgres" || url.search !== "" || url.hash !== "" ||
      url.port !== "5433" || url.username === "") {
    throw new Error("Load database must use 127.0.0.1:5433/postgres without URL options");
  }
  return url.toString();
}

export function portOf(value = "3420"): number {
  if (!/^\d+$/.test(value)) throw new Error("Invalid local load port");
  const port = Number(value);
  if (port < 1024 || port > 65535) throw new Error("Invalid local load port");
  return port;
}

/** Only generated run-owned database names may be created or cleaned up. */
export function databaseName(value: string): string {
  if (!/^incision_load_[0-9]{13}_[a-f0-9]{12}$/.test(value)) throw new Error("Invalid load database name");
  return value;
}

export function config(env: NodeJS.ProcessEnv) {
  if (env.LOAD_CONFIRM !== "local-only") throw new Error("Set LOAD_CONFIRM=local-only");
  if (env.LOAD_URL !== undefined) throw new Error("External load targets are not supported");
  return {
    admin: localAdminUrl(env.LOAD_DATABASE_URL ?? "postgresql://incision_test:incision_test_only@127.0.0.1:5433/postgres"),
    port: portOf(env.LOAD_PORT),
    runners: 30,
    spectators: 20,
  } as const;
}

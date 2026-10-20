import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export const root = path.resolve(import.meta.dirname, "../../..");
export const app = path.join(root, "apps/web");

async function requireUnusedPort(port: number) {
  const probe = net.createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", () => probe.close((error) => error ? reject(error) : resolve()));
  });
}

export async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  const force = setTimeout(() => child.kill("SIGKILL"), 8_000);
  try { await exited; } finally { clearTimeout(force); }
}

export async function start(input: { port: number; database: string; secret: string }, signal: AbortSignal) {
  await access(path.join(app, ".next/BUILD_ID"));
  // Next and the custom server load dotenv files. Refuse rather than read any developer secrets.
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    const exists = await access(path.join(app, name)).then(() => true, () => false);
    if (exists) throw new Error("Run the load harness in a worktree without web dotenv files");
  }
  await requireUnusedPort(input.port);
  const origin = `http://127.0.0.1:${input.port}`;
  let output = "";
  const child = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
    cwd: app,
    env: {
      PATH: process.env.PATH, TMPDIR: process.env.TMPDIR,
      NODE_ENV: "production", PORT: String(input.port), APP_URL: origin, AUTH_URL: origin,
      AUTH_SECRET: input.secret, DATABASE_URL: input.database, TRUSTED_PROXY_HOPS: "0",
      RACES_ENABLED: "true",
      AUTH_GITHUB_ID: "load-fixture", AUTH_GITHUB_SECRET: "load-fixture",
      AUTH_DISCORD_ID: "load-fixture", AUTH_DISCORD_SECRET: "load-fixture",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let spawnFailed = false;
  child.once("error", () => { spawnFailed = true; });
  // Bounded, private diagnostic buffer. Never put database URLs or tokens in the report.
  const collect = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-32_768); };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);
  try {
    for (let attempt = 0; attempt < 120; attempt++) {
      signal.throwIfAborted();
      if (spawnFailed || child.exitCode !== null) throw new Error("Load server failed to start");
      try {
        const response = await fetch(`${origin}/api/health/live`, {
          redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(1_000)]),
        });
        if (response.ok) return { origin, child, log: () => output };
      } catch { signal.throwIfAborted(); }
      await sleep(500, undefined, { signal });
    }
    throw new Error("Load server startup timeout");
  } catch (error) {
    if (!spawnFailed) await stop(child);
    throw error;
  }
}

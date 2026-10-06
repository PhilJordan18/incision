import { parseArgs } from "node:util";
import { io } from "socket.io-client";
import { z } from "zod";

// Usage: npm run smoke -w @incision/web -- <base-url> [--commit <sha>] [--database up|down|not_configured]
const healthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  commit: z.string(),
  database: z.enum(["up", "down", "not_configured"]),
});
type Health = z.infer<typeof healthSchema>;

type Expectations = {
  readonly commit: string | undefined;
  readonly database: Health["database"] | undefined;
};

// App Service may take several minutes to extract and restart a new release.
const DEADLINE_MS = 6 * 60_000;
const RETRY_DELAY_MS = 6_000;

async function main(): Promise<void> {
  const { origin, expectations } = readArguments();
  const health = await waitForHealth(origin, expectations);
  console.log(`health: ${JSON.stringify(health)}`);
  const latency = await pingOverWebSocket(origin);
  console.log(`websocket ping: ${latency} ms`);
}

function readArguments(): { origin: string; expectations: Expectations } {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    strict: true,
    options: { commit: { type: "string" }, database: { type: "string" } },
  });
  const parsed = z
    .object({
      baseUrl: z.url({ protocol: /^https?$/ }),
      commit: z.string().min(1).optional(),
      database: healthSchema.shape.database.optional(),
    })
    .parse({ baseUrl: positionals[0], commit: values.commit, database: values.database });
  return { origin: new URL(parsed.baseUrl).origin, expectations: { commit: parsed.commit, database: parsed.database } };
}

/** Retries until the expected commit answers with the expected database state, or the deadline passes. */
async function waitForHealth(origin: string, expected: Expectations): Promise<Health> {
  const deadline = Date.now() + DEADLINE_MS;
  for (let attempt = 1; ; attempt += 1) {
    const problem = await checkHealthOnce(origin, expected);
    if (typeof problem !== "string") {
      return problem;
    }
    if (Date.now() + RETRY_DELAY_MS > deadline) {
      throw new Error(`health check failed: ${problem}`);
    }
    console.log(`health attempt ${attempt}: ${problem}`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
}

/** Returns the health payload when it meets the expectations, otherwise the reason it does not. */
async function checkHealthOnce(origin: string, expected: Expectations): Promise<Health | string> {
  try {
    const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      return `HTTP ${response.status}`;
    }
    const health = healthSchema.parse(await response.json());
    if (expected.commit !== undefined && health.commit !== expected.commit) {
      return `commit ${health.commit} still deployed`;
    }
    if (expected.database !== undefined && health.database !== expected.database) {
      return `database is "${health.database}", expected "${expected.database}"`;
    }
    return health;
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function pingOverWebSocket(origin: string): Promise<number> {
  // WebSocket only: a silent fallback to HTTP polling would hide a broken upgrade.
  const socket = io(origin, { transports: ["websocket"], extraHeaders: { origin }, reconnection: false, timeout: 10_000 });
  try {
    const sentAt = Date.now();
    const ack: unknown = await socket.timeout(10_000).emitWithAck("system:ping", { sentAt });
    if (!z.object({ ok: z.literal(true) }).safeParse(ack).success) {
      throw new Error(`unexpected ping ack: ${JSON.stringify(ack)}`);
    }
    return Date.now() - sentAt;
  } finally {
    socket.close();
  }
}

main().catch((error: unknown) => {
  console.error(`smoke test failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

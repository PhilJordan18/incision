import { io } from "socket.io-client";
import { z } from "zod";

// Usage: npm run smoke -w @incision/web -- <base-url> [--commit <sha>] [--database up]
const argsSchema = z.object({
  baseUrl: z.url({ protocol: /^https?$/ }),
  commit: z.string().min(1).optional(),
  database: z.enum(["up", "down", "not_configured"]).optional(),
});

const healthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  commit: z.string(),
  database: z.enum(["up", "down", "not_configured"]),
});

const ATTEMPTS = 20;
const RETRY_DELAY_MS = 6_000;

async function main(): Promise<void> {
  const args = argsSchema.parse(readArgs(process.argv.slice(2)));
  const origin = new URL(args.baseUrl).origin;

  const health = await waitForHealth(origin, args.commit);
  console.log(`health: ${JSON.stringify(health)}`);
  if (args.database && health.database !== args.database) {
    throw new Error(`database is "${health.database}", expected "${args.database}"`);
  }

  const latency = await pingOverWebSocket(origin);
  console.log(`websocket ping: ${latency} ms`);
}

/** Retries while the app restarts after a deployment, until the expected commit answers. */
async function waitForHealth(origin: string, expectedCommit: string | undefined): Promise<z.infer<typeof healthSchema>> {
  let lastProblem = "no attempt";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(10_000) });
      if (response.ok) {
        const health = healthSchema.parse(await response.json());
        if (expectedCommit === undefined || health.commit === expectedCommit) {
          return health;
        }
        lastProblem = `commit ${health.commit} still deployed`;
      } else {
        lastProblem = `HTTP ${response.status}`;
      }
    } catch (error: unknown) {
      lastProblem = error instanceof Error ? error.message : String(error);
    }
    console.log(`health attempt ${attempt}/${ATTEMPTS}: ${lastProblem}`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
  throw new Error(`health check failed: ${lastProblem}`);
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

function readArgs(argv: readonly string[]): Record<string, string | undefined> {
  const [baseUrl, ...rest] = argv;
  const options: Record<string, string | undefined> = { baseUrl };
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index]?.replace(/^--/, "");
    if (name) {
      options[name] = rest[index + 1];
    }
  }
  return options;
}

main().catch((error: unknown) => {
  console.error(`smoke test failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

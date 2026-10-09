import net from "node:net";

export type StallingProxy = {
  /** The database URL through the proxy. */
  readonly url: string;
  /** Holds back everything the server sends, as a stalled network would; the client's own messages still pass. */
  readonly stall: () => void;
  /** Delivers what was held back, then forwards again. */
  readonly resume: () => void;
  readonly close: () => Promise<void>;
};

/**
 * A local TCP proxy in front of the test PostgreSQL that can stall the server's answers. When
 * the client closes its side, the proxy closes the server's side, as a real network path does.
 */
export async function startStallingProxy(databaseUrl: string): Promise<StallingProxy> {
  const target = new URL(databaseUrl);
  let stalled = false;
  let held: (() => void)[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer((client) => {
    const upstream = net.connect(Number(target.port || 5432), target.hostname);
    sockets.add(client);
    sockets.add(upstream);
    const closeBoth = () => {
      client.destroy();
      upstream.destroy();
      sockets.delete(client);
      sockets.delete(upstream);
    };
    client.on("data", (chunk) => upstream.write(chunk));
    upstream.on("data", (chunk) => {
      if (stalled) {
        held.push(() => client.write(chunk));
      } else {
        client.write(chunk);
      }
    });
    client.on("close", closeBoth);
    upstream.on("close", closeBoth);
    client.on("error", closeBoth);
    upstream.on("error", closeBoth);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("The proxy has no TCP port");
  }
  const url = new URL(databaseUrl);
  url.hostname = "127.0.0.1";
  url.port = String(address.port);
  return {
    url: url.toString(),
    stall: () => {
      stalled = true;
    },
    resume: () => {
      stalled = false;
      const pending = held;
      held = [];
      for (const deliver of pending) {
        deliver();
      }
    },
    close: async () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

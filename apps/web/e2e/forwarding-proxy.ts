import http from "node:http";

export type ForwardingProxy = { readonly url: string; readonly close: () => Promise<void> };

/**
 * A stand-in for Azure's front end: forwards every request to the app and appends `peer` to
 * `X-Forwarded-For`, as the real front end appends the address it saw. With
 * TRUSTED_PROXY_HOPS=1 (playwright.config.ts, as in production) the app trusts that last
 * entry only, so each proxy is one client network and whatever the browser writes in the
 * headers cannot change it. WebSocket upgrades are not forwarded.
 */
export async function startForwardingProxy(target: string, peer: string): Promise<ForwardingProxy> {
  const upstream = new URL(target);
  const server = http.createServer((request, response) => {
    const written = [request.headers["x-forwarded-for"] ?? []].flat().join(", ");
    const forwarded = http.request(
      {
        hostname: upstream.hostname,
        port: upstream.port,
        path: request.url,
        method: request.method,
        headers: { ...request.headers, "x-forwarded-for": written === "" ? peer : `${written}, ${peer}` },
      },
      (reply) => {
        response.writeHead(reply.statusCode ?? 502, reply.headers);
        reply.pipe(response);
      },
    );
    forwarded.on("error", () => {
      if (response.headersSent) {
        response.destroy();
      } else {
        response.writeHead(502).end();
      }
    });
    request.pipe(forwarded);
  });
  // Like the app's own server: every interface, so "localhost" works over IPv4 and IPv6.
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("The test proxy has no TCP port");
  }
  return {
    url: `http://localhost:${address.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        // Browsers keep connections alive; close them so the server can stop.
        server.closeAllConnections();
      }),
  };
}

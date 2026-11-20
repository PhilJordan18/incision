import { createServer } from "node:http";
import { Server } from "socket.io";
import { io } from "socket.io-client";
import { expect, it } from "vitest";
import { answerPing, PING_EVENT } from "../server/realtime/ping";
import { ClockSync } from "./clock-sync";

it("calibrates through an actual Socket.IO acknowledgement using the existing ping handler", async () => {
  const http = createServer();
  const server = new Server(http);
  server.on("connection", (socket) => {
    socket.on(PING_EVENT, (payload: unknown, ack: (value: unknown) => void) => ack(answerPing(payload, Date.now)));
  });
  await new Promise<void>((resolve, reject) => { http.once("error", reject); http.listen(0, "127.0.0.1", resolve); });
  const address = http.address();
  if (address === null || typeof address === "string") throw new Error("missing test port");
  const socket = io(`http://127.0.0.1:${address.port}`, { autoConnect: false, reconnection: false });
  let calibrated: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => { calibrated = resolve; });
  const clock = new ClockSync({
    now: () => Date.now() + 60_000,
    monotonic: () => performance.now(),
    schedule: (callback, delay) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); },
    changed: () => calibrated?.(),
  });
  try {
    await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); socket.connect(); });
    clock.start((sentAt) => socket.timeout(1_000).emitWithAck(PING_EVENT, { sentAt }));
    await ready;
    // A 60-second wrong browser clock is corrected; local scheduling is allowed 250 ms.
    expect(Math.abs(clock.now() - Date.now())).toBeLessThan(250);
  } finally {
    clock.stop();
    socket.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

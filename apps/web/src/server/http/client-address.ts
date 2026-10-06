import { isIP } from "node:net";

/** Internal header set by the custom server; any value sent by a client is replaced. */
export const CLIENT_ADDRESS_HEADER = "x-incision-client-address";

type RequestLike = {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly socket: { readonly remoteAddress?: string | undefined };
};

/**
 * Address of the client as seen by the last `trustedProxyHops` proxies. Azure's front
 * end appends the address it saw to `X-Forwarded-For`, so with one trusted hop the
 * last entry is the client; earlier entries are whatever the client wrote and are
 * ignored. Without trusted proxies (local runs), the TCP peer is the client.
 */
export function clientAddress(request: RequestLike, trustedProxyHops: number): string {
  const peer = normaliseAddress(request.socket.remoteAddress ?? "") ?? "unknown";
  if (trustedProxyHops === 0) {
    return peer;
  }
  const header = request.headers["x-forwarded-for"];
  const values = (Array.isArray(header) ? header.join(",") : (header ?? "")).split(",").map((value) => value.trim());
  const entries = values.filter((value) => value.length > 0);
  const candidate = entries.at(-trustedProxyHops);
  return (candidate === undefined ? undefined : normaliseAddress(candidate)) ?? peer;
}

/** Strips the port Azure appends (`1.2.3.4:5678`, `[::1]:5678`) and IPv4-mapped IPv6. */
export function normaliseAddress(value: string): string | undefined {
  let address = value.trim();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(address);
  if (bracketed?.[1] !== undefined) {
    address = bracketed[1];
  } else if (/^[\d.]+:\d+$/.test(address)) {
    address = address.slice(0, address.lastIndexOf(":"));
  }
  if (address.toLowerCase().startsWith("::ffff:") && isIP(address.slice(7)) === 4) {
    address = address.slice(7);
  }
  return isIP(address) === 0 ? undefined : address.toLowerCase();
}

/**
 * Key for per-address limits: an IPv4 address, or the /64 prefix of an IPv6 address,
 * which a single subscriber usually controls entirely.
 */
export function addressLimitKey(address: string): string {
  if (isIP(address) !== 6) {
    return address;
  }
  const [head = "", tail = ""] = address.split("::");
  const headGroups = head === "" ? [] : head.split(":");
  const tailGroups = tail === "" ? [] : tail.split(":");
  const groups = address.includes("::")
    ? [...headGroups, ...Array<string>(8 - headGroups.length - tailGroups.length).fill("0"), ...tailGroups]
    : headGroups;
  return `${groups
    .slice(0, 4)
    .map((group) => Number.parseInt(group, 16).toString(16))
    .join(":")}::/64`;
}

import { createHash, createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { normaliseAddress } from "../http/client-address";

/** The raw token is returned once to the host; only the digest belongs in storage. */
export function issueInvitationToken(): { readonly token: string; readonly digest: string } {
  const bytes = randomBytes(32);
  return { token: bytes.toString("base64url"), digest: createHash("sha256").update(bytes).digest("hex") };
}

export function invitationTokenDigest(token: unknown): string | undefined {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
  const bytes = Buffer.from(token, "base64url");
  if (bytes.length !== 32 || bytes.toString("base64url") !== token) return undefined;
  return createHash("sha256").update(bytes).digest("hex");
}

/** Canonical full address, unlike the intentionally coarser IPv6 rate-limit bucket. */
function canonicalAddress(value: string): string | undefined {
  const address = normaliseAddress(value);
  if (address === undefined) return undefined;
  if (isIP(address) === 4) return address;
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  // IPv4-mapped IPv6 is the same endpoint as dotted IPv4, in either input spelling.
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(canonical);
  if (mapped?.[1] !== undefined && mapped[2] !== undefined) {
    const high = Number.parseInt(mapped[1], 16);
    const low = Number.parseInt(mapped[2], 16);
    return [high >>> 8, high & 255, low >>> 8, low & 255].join(".");
  }
  return canonical;
}

/**
 * Input address must come from the custom server's overwritten internal header.
 * Missing/unparsed addresses fail closed; never bind every unknown client together.
 * Key is a dedicated server secret, not the public token or a client-supplied value.
 */
export function invitationAddressDigest(input: {
  readonly address: string | undefined;
  readonly lobbyId: string;
  readonly key: string | undefined;
}): string | undefined {
  if (input.address === undefined || input.key === undefined || Buffer.byteLength(input.key) < 32
    || Buffer.byteLength(input.key) > 1024 || input.lobbyId.length === 0) return undefined;
  const address = canonicalAddress(input.address);
  if (address === undefined) return undefined;
  return createHmac("sha256", input.key).update(JSON.stringify(["incision:invitation-address:v1", input.lobbyId, address])).digest("hex");
}

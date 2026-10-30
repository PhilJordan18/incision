import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export const GUEST_IDLE_SECONDS = 24 * 60 * 60;
const MAX_COOKIE_BYTES = 512;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PURPOSE = "incision:guest-session:v1:";

export type GuestCredential = { readonly id: string; readonly secretDigest: string };
export type GuestCookieRead =
  | { readonly kind: "absent" }
  | { readonly kind: "invalid" }
  | { readonly kind: "valid"; readonly credential: GuestCredential; readonly value: string };

export function guestCookieName(secure: boolean): string {
  return secure ? "__Host-incision.guest" : "incision.guest";
}

/** Only synthetics in tests; production receives a dedicated server-only key. */
export function guestSigningKey(value: string | undefined): string | undefined {
  return value !== undefined && Buffer.byteLength(value) >= 32 && Buffer.byteLength(value) <= 1024 ? value : undefined;
}

function tag(payload: string, key: string): Buffer {
  return createHmac("sha256", key).update(PURPOSE).update(payload).digest();
}

function decodeProof(encoded: string): Buffer | undefined {
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) return undefined;
  const bytes = Buffer.from(encoded, "base64url");
  return bytes.length === 32 && bytes.toString("base64url") === encoded ? bytes : undefined;
}

export function issueGuestCookie(key: string): { readonly value: string; readonly credential: GuestCredential } {
  if (guestSigningKey(key) === undefined) throw new Error("Guest signing key unavailable");
  const id = randomUUID();
  const proof = randomBytes(32);
  const payload = `v1.${id}.${proof.toString("base64url")}`;
  return {
    value: `${payload}.${tag(payload, key).toString("base64url")}`,
    credential: { id, secretDigest: createHash("sha256").update(proof).digest("hex") },
  };
}

/** Raw header parsing preserves duplicates; framework cookie maps can hide them. */
export function readGuestCookie(header: string | null, options: { readonly secure: boolean; readonly key: string }): GuestCookieRead {
  const name = guestCookieName(options.secure);
  const cookies = (header ?? "").split(";").map((part) => part.trim());
  const matches = cookies.filter((part) => part === name || part.startsWith(`${name}=`));
  if (matches.length === 0) return { kind: "absent" };
  const entry = matches[0];
  if (matches.length !== 1 || entry === undefined || !entry.startsWith(`${name}=`)) return { kind: "invalid" };
  const value = entry.slice(name.length + 1);
  if (value.length > MAX_COOKIE_BYTES || guestSigningKey(options.key) === undefined) return { kind: "invalid" };
  const parts = value.split(".");
  const [version, id, encoded, signature] = parts;
  if (parts.length !== 4 || version !== "v1" || id === undefined || !UUID.test(id) || encoded === undefined || signature === undefined) {
    return { kind: "invalid" };
  }
  const proof = decodeProof(encoded);
  const suppliedTag = decodeProof(signature);
  if (proof === undefined || suppliedTag === undefined || !timingSafeEqual(suppliedTag, tag(`v1.${id}.${encoded}`, options.key))) {
    return { kind: "invalid" };
  }
  return { kind: "valid", value, credential: { id, secretDigest: createHash("sha256").update(proof).digest("hex") } };
}

/** Values are produced by the codec, never echoed from an unvalidated request. */
export function guestSetCookie(value: string, secure: boolean, maxAge: number = GUEST_IDLE_SECONDS): string {
  if (!Number.isSafeInteger(maxAge) || maxAge <= 0 || maxAge > GUEST_IDLE_SECONDS) throw new RangeError("Invalid guest cookie lifetime");
  return `${guestCookieName(secure)}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

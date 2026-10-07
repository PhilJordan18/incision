import { randomBytes, scrypt, type ScryptOptions, timingSafeEqual } from "node:crypto";

/**
 * Local password hashes (SEC-03): scrypt with a random 16-byte salt, stored as
 * `scrypt$<log2 N>$<r>$<p>$<salt>$<key>` with unpadded base64url salt and key.
 *
 * Parameters follow OWASP's scrypt option N=2^15, r=8, p=3 (32 MiB, a few hundred
 * milliseconds per hash). Stored parameters are accepted only within bounds, so a
 * corrupted or hostile row cannot make verification cheap or exhaust memory.
 */
export const PASSWORD_HASH_PARAMETERS = { logN: 15, r: 8, p: 3 } as const;

/** Room for one stronger setting later; at most 64 MiB and 4 passes per verification. */
const PARAMETER_BOUNDS = { logN: [15, 16], r: [8, 8], p: [1, 4] } as const;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
/** 128 · N · r bytes plus margin; Node refuses a cost above maxmem. */
const MAX_MEMORY_BYTES = 128 * 2 ** PARAMETER_BOUNDS.logN[1] * PARAMETER_BOUNDS.r[1] + 1024 * 1024;

type HashParameters = { readonly logN: number; readonly r: number; readonly p: number };
export type ParsedPasswordHash = HashParameters & { readonly salt: Buffer; readonly key: Buffer };

const HASH_FORMAT = /^scrypt\$(\d{2})\$(\d{1,2})\$(\d)\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt, PASSWORD_HASH_PARAMETERS);
  const { logN, r, p } = PASSWORD_HASH_PARAMETERS;
  return `scrypt$${logN}$${r}$${p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/** Strict parser: every field, its bounds and its canonical encoding; null otherwise. */
export function parsePasswordHash(stored: string): ParsedPasswordHash | null {
  const match = HASH_FORMAT.exec(stored);
  if (match === null) {
    return null;
  }
  const [, logNText, rText, pText, saltText, keyText] = match;
  const parameters = { logN: Number(logNText), r: Number(rText), p: Number(pText) };
  if (!withinBounds(parameters) || [logNText, rText, pText].some((text) => String(Number(text)) !== text)) {
    return null;
  }
  const salt = Buffer.from(saltText ?? "", "base64url");
  const key = Buffer.from(keyText ?? "", "base64url");
  // Rejects non-canonical trailing bits that would decode to the same bytes.
  if (salt.toString("base64url") !== saltText || key.toString("base64url") !== keyText) {
    return null;
  }
  return { ...parameters, salt, key };
}

/**
 * Constant-time comparison of the derived key. A malformed stored hash verifies as
 * false after the same amount of work as a real one, so it is not distinguishable.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parsePasswordHash(stored);
  const target = parsed ?? (await decoyHash());
  const key = await deriveKey(password, target.salt, target);
  return parsed !== null && timingSafeEqual(key, target.key);
}

/**
 * Same work as a real verification, for an unknown login or an account without a
 * password: the response time does not reveal whether the login exists.
 */
export async function verifyAgainstDecoy(password: string): Promise<false> {
  const decoy = await decoyHash();
  await deriveKey(password, decoy.salt, decoy);
  return false;
}

let decoy: Promise<ParsedPasswordHash> | undefined;

function decoyHash(): Promise<ParsedPasswordHash> {
  decoy ??= hashPassword(randomBytes(32).toString("base64url")).then((hash) => {
    const parsed = parsePasswordHash(hash);
    if (parsed === null) {
      throw new Error("Generated password hash does not parse");
    }
    return parsed;
  });
  return decoy;
}

function withinBounds({ logN, r, p }: HashParameters): boolean {
  const { logN: logNBounds, r: rBounds, p: pBounds } = PARAMETER_BOUNDS;
  return (
    logN >= logNBounds[0] && logN <= logNBounds[1] && r >= rBounds[0] && r <= rBounds[1] && p >= pBounds[0] && p <= pBounds[1]
  );
}

function deriveKey(password: string, salt: Buffer, { logN, r, p }: HashParameters): Promise<Buffer> {
  const options: ScryptOptions = { N: 2 ** logN, r, p, maxmem: MAX_MEMORY_BYTES };
  return new Promise((resolve, reject) => {
    // NFKC, as NIST SP 800-63B suggests: the same password typed on another keyboard matches.
    scrypt(password.normalize("NFKC"), salt, KEY_BYTES, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

import type { GuestSessionRead, GuestSessionRow } from "@incision/database";
import { issueGuestCookie, readGuestCookie, type GuestCredential } from "./guest-cookie";

export type GuestStore = {
  readonly create: (proof: GuestCredential) => Promise<GuestSessionRow>;
  readonly read: (proof: GuestCredential) => Promise<GuestSessionRead>;
  readonly touch: (proof: GuestCredential) => Promise<GuestSessionRead>;
};
export type GuestResolution =
  | { readonly kind: "absent" | "invalid" | "expired" | "unavailable" }
  | { readonly kind: "valid"; readonly session: GuestSessionRow; readonly cookie: string };

/** A failed read never falls through to creation. Only an explicitly absent cookie may start. */
export async function resolveGuest(input: {
  readonly cookieHeader: string | null;
  readonly secure: boolean;
  readonly key: string;
  readonly operation: "read" | "start" | "renew";
}, store: GuestStore): Promise<GuestResolution> {
  const parsed = readGuestCookie(input.cookieHeader, input);
  if (parsed.kind === "invalid") return parsed;
  try {
    if (parsed.kind === "absent") {
      if (input.operation !== "start") return parsed;
      const issued = issueGuestCookie(input.key);
      const session = await store.create(issued.credential);
      return { kind: "valid", session, cookie: issued.value };
    }
    const result = await (input.operation === "read" ? store.read(parsed.credential) : store.touch(parsed.credential));
    return result.kind === "valid" ? { ...result, cookie: parsed.value } : result;
  } catch {
    // No exception message, cookie, database query or proof is logged or returned.
    return { kind: "unavailable" };
  }
}

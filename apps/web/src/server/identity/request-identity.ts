import type { HumanSubject } from "@incision/domain";
import type { HandshakeAuthentication } from "../realtime/socket-session";

export type AccountIdentity =
  | { readonly kind: "account"; readonly subject: Extract<HumanSubject, { kind: "account" }> }
  | { readonly kind: "absent" | "invalid" | "unavailable" };

/**
 * Reuses account verification, never its cookie format for guests. A present invalid
 * account cookie blocks fallback even when a valid guest cookie is also present.
 */
export async function resolveAccountIdentity(header: string | null, verify: (header: string | undefined) => Promise<HandshakeAuthentication>): Promise<AccountIdentity> {
  // Auth.js collects every cookie starting with its session prefix, not just numeric
  // chunks. Match that boundary too, so a malformed suffix cannot trigger guest fallback.
  const present = (header ?? "").split(";").some((part) => /^(?:__Secure-)?authjs\.session-token/.test(part.trim()));
  if (!present) return { kind: "absent" };
  try {
    const result = await verify(header ?? undefined);
    if (result.kind === "authenticated") return { kind: "account", subject: { kind: "account", accountId: result.session.accountId } };
    return { kind: result.kind === "refused" && (result.reason === "CHECK_FAILED" || result.reason === "NO_SECRET") ? "unavailable" : "invalid" };
  } catch {
    return { kind: "unavailable" };
  }
}

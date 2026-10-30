import type { RoomHostActor } from "@incision/database";
import { getAccountSession } from "../auth/session";
import { guestEntryEnabled } from "../identity/guest-entry-switch";
import { requestGuest } from "../identity/guest-request";

/** Account precedence and verified guest proofs; no caller-supplied identity. */
export async function invitationActor(): Promise<{
  actor: RoomHostActor; key: string; guest?: NonNullable<Awaited<ReturnType<typeof requestGuest>>>;
} | undefined> {
  const account = await getAccountSession();
  if (account !== null) return { actor: account, key: `account:${account.accountId}` };
  if (!guestEntryEnabled()) return undefined;
  const guest = await requestGuest();
  return guest === undefined ? undefined : {
    actor: { accountId: null, guestProof: guest.proof }, key: `guest:${guest.proof.id}`, guest,
  };
}

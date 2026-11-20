import { canResumeInvitationMembership } from "@incision/database";
import { headers } from "next/headers";
import { authDatabase } from "../auth/store";
import { CLIENT_ADDRESS_HEADER } from "../http/client-address";
import { invitationAddressDigest } from "./invitation-credentials";

export async function canResumeInvitationRequest(member: { memberId: string; lobbyId: string }): Promise<boolean> {
  const address = (await headers()).get(CLIENT_ADDRESS_HEADER) ?? undefined;
  return canResumeInvitationMembership(authDatabase(), { memberId: member.memberId,
    addressDigest: invitationAddressDigest({ address, lobbyId: member.lobbyId, key: process.env.INVITATION_IP_SECRET }) });
}

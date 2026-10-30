import { describe, expect, it } from "vitest";
import type { HumanSubject } from "../identity/human-subject";
import { invitationAccess } from "./invitation-access";

const subjects: HumanSubject[] = [
  { kind: "account", accountId: "same-id" },
  { kind: "guest", guestSessionId: "same-id" },
];
describe("invitation ownership (SALLE-04 / D-02)", () => {
  for (const subject of subjects) {
    it(`binds a first successful ${subject.kind} admission and permits its reuse`, () => {
      const input = { roomClosed: false, revoked: false, subject, addressDigest: "room-scoped-address" };
      expect(invitationAccess({ ...input, binding: null })).toEqual({ ok: true, kind: "bind" });
      expect(invitationAccess({ ...input, binding: { subject, addressDigest: input.addressDigest } })).toEqual({ ok: true, kind: "reuse" });
    });
    it(`refuses another IP even for the same ${subject.kind}`, () => {
      expect(invitationAccess({ roomClosed: false, revoked: false, subject, addressDigest: "another-address",
        binding: { subject, addressDigest: "first-address" } })).toEqual({ ok: false, error: "INVITATION_UNAVAILABLE" });
    });
    it.each([undefined, ""])(`refuses an unavailable address for ${subject.kind}: %s`, (addressDigest) => {
      expect(invitationAccess({ roomClosed: false, revoked: false, subject, addressDigest, binding: null }).ok).toBe(false);
    });
    it.each([{ roomClosed: true, revoked: false }, { roomClosed: false, revoked: true }])(
      `refuses closed/revoked links for ${subject.kind}, unused or bound`, (state) => {
        for (const binding of [null, { subject, addressDigest: "address" }]) {
          expect(invitationAccess({ ...state, subject, addressDigest: "address", binding }).ok).toBe(false);
        }
      });
  }
  it("does not confuse account and guest IDs behind the same NAT", () => {
    expect(invitationAccess({ roomClosed: false, revoked: false, subject: subjects[1]!, addressDigest: "shared-nat",
      binding: { subject: subjects[0]!, addressDigest: "shared-nat" } }).ok).toBe(false);
  });
  it("refuses another account or guest behind the same NAT", () => {
    for (const subject of subjects) {
      const other: HumanSubject = subject.kind === "account" ? { kind: "account", accountId: "other" } : { kind: "guest", guestSessionId: "other" };
      expect(invitationAccess({ roomClosed: false, revoked: false, subject: other, addressDigest: "shared-nat",
        binding: { subject, addressDigest: "shared-nat" } }).ok).toBe(false);
    }
  });
});

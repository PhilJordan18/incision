import { describe, expect, it } from "vitest";
import type { HumanSubject } from "../identity/human-subject";
import { decideExpulsion, type ModerationTarget } from "./moderation";
import { MEMBER_ROLES, ROOM_PHASES } from "./room-admission";

const subjects: HumanSubject[] = [
  { kind: "account", accountId: "same-uuid" },
  { kind: "guest", guestSessionId: "same-uuid" },
];
const target: ModerationTarget = { memberId: "target", subject: subjects[0]!, role: "participant", active: true };
const input = { phase: "waiting" as const, actorMemberId: "host", hostMemberId: "host", target };

describe("room expulsion authorization", () => {
  for (const phase of ROOM_PHASES.filter((value) => value !== "closed")) {
    for (const role of MEMBER_ROLES) {
      it.each(subjects)(`expels a ${role} during ${phase} by its exact identity: %j`, (subject) => {
        const decision = decideExpulsion({ ...input, phase, target: { ...target, role, subject } });
        expect(decision).toEqual({ ok: true, memberId: "target", bannedSubject: subject });
      });
    }
  }
  it.each([undefined, "another-member"])("refuses an absent/non-host actor: %s", (actorMemberId) => {
    expect(decideExpulsion({ ...input, actorMemberId })).toEqual({ ok: false, error: "NOT_HOST" });
  });
  it("refuses when the host has changed since a client rendered its controls", () => {
    expect(decideExpulsion({ ...input, hostMemberId: "new-host" })).toEqual({ ok: false, error: "NOT_HOST" });
  });
  it("does not disclose target or phase details to a non-host", () => {
    expect(decideExpulsion({ ...input, actorMemberId: undefined, phase: "closed", target: undefined }))
      .toEqual({ ok: false, error: "NOT_HOST" });
  });
  it("refuses closure and does not create a ban after the room ends", () => {
    expect(decideExpulsion({ ...input, phase: "closed" })).toEqual({ ok: false, error: "ROOM_CLOSED" });
  });
  it.each([undefined, { ...target, active: false }])("refuses an absent or departed target: %j", (candidate) => {
    expect(decideExpulsion({ ...input, target: candidate })).toEqual({ ok: false, error: "INVALID_TARGET" });
  });
  it("requires the host to use departure rather than expelling itself", () => {
    expect(decideExpulsion({ ...input, target: { ...target, memberId: "host" } }))
      .toEqual({ ok: false, error: "CANNOT_EXPEL_SELF" });
  });
});

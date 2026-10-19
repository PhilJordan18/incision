import { describe, expect, it } from "vitest";
import { AttemptLimiter } from "@/server/auth/attempt-limiter";
import { allowRoomChange, forgiveRoomChange, ROOM_CHANGE_LIMIT } from "./room-change-limiter";

describe("allowRoomChange", () => {
  it("allows a few changes per account and minute, then refuses until the minute ends", () => {
    let now = 0;
    const limiter = new AttemptLimiter(ROOM_CHANGE_LIMIT, () => now);
    const allowed = Array.from({ length: ROOM_CHANGE_LIMIT.maxFailures + 2 }, () => allowRoomChange("alice", limiter));
    expect(allowed.filter(Boolean)).toHaveLength(ROOM_CHANGE_LIMIT.maxFailures);
    expect(allowRoomChange("bruno", limiter)).toBe(true);
    now = ROOM_CHANGE_LIMIT.windowMs;
    expect(allowRoomChange("alice", limiter)).toBe(true);
  });
});

describe("forgiveRoomChange", () => {
  it("gives back a change that did not happen", () => {
    const limiter = new AttemptLimiter(ROOM_CHANGE_LIMIT, () => 0);
    for (let index = 0; index < ROOM_CHANGE_LIMIT.maxFailures; index += 1) {
      expect(allowRoomChange("alice", limiter)).toBe(true);
    }
    expect(allowRoomChange("alice", limiter)).toBe(false);
    forgiveRoomChange("alice", limiter);
    expect(allowRoomChange("alice", limiter)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { answerPing } from "./ping";

const now = () => 1_700_000_000_000;

describe("answerPing", () => {
  it("acknowledges a valid ping with the server time", () => {
    expect(answerPing({ sentAt: 123 }, now)).toEqual({ ok: true, serverTime: 1_700_000_000_000 });
  });

  it.each([undefined, null, "ping", {}, { sentAt: "123" }, { sentAt: Number.POSITIVE_INFINITY }, { sentAt: 1, extra: true }])(
    "rejects an invalid payload (%o)",
    (payload) => {
      expect(answerPing(payload, now)).toEqual({ ok: false, error: "INVALID_PAYLOAD" });
    },
  );
});

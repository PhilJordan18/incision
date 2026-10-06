import { describe, expect, it } from "vitest";
import { describeDatabaseError } from "./pool";

describe("describeDatabaseError", () => {
  it("lists the inner errors of an AggregateError, whose own message is empty", () => {
    const refused = (address: string) =>
      Object.assign(new Error(`connect ECONNREFUSED ${address}`), { code: "ECONNREFUSED" });
    const error = new AggregateError([refused("::1:5432"), refused("127.0.0.1:5432")], "");
    expect(describeDatabaseError(error)).toBe(
      "ECONNREFUSED connect ECONNREFUSED ::1:5432; ECONNREFUSED connect ECONNREFUSED 127.0.0.1:5432",
    );
  });

  it("describes the PostgreSQL cause of a wrapped query error, without the query parameters", () => {
    const cause = Object.assign(new Error('relation "missing" does not exist'), { code: "42P01" });
    const wrapped = new Error("Failed query: select * from missing where secret = $1\nparams: hunter2", { cause });
    expect(describeDatabaseError(wrapped)).toBe('42P01 relation "missing" does not exist');
  });

  it("falls back to the error name when the message is empty", () => {
    expect(describeDatabaseError(new TypeError(""))).toBe("TypeError");
  });

  it("does not stringify unknown values that could carry configuration", () => {
    expect(describeDatabaseError({ connectionString: "postgresql://u:p@h/db" })).toBe("unknown error");
  });
});

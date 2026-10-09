import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";
import { sqlStateOf, uniqueViolationOf } from "./errors";

const postgres = (code: string, fields: Record<string, string> = {}) => Object.assign(new Error("from the server"), { code, ...fields });

describe("sqlStateOf", () => {
  it("reads the SQLSTATE through Drizzle's wrapper", () => {
    expect(sqlStateOf(new DrizzleQueryError("select 1", [], postgres("55P03")))).toBe("55P03");
  });

  it("has none for a client-side failure, nor for a Node error code", () => {
    expect(sqlStateOf(new Error("Query read timeout"))).toBeUndefined();
    expect(sqlStateOf(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }))).toBeUndefined();
    expect(sqlStateOf("not an error")).toBeUndefined();
  });

  it("stops following causes after a few levels, so a cycle cannot loop", () => {
    const cyclic: Error & { cause?: unknown } = new Error("cyclic");
    cyclic.cause = cyclic;
    expect(sqlStateOf(cyclic)).toBeUndefined();
  });
});

describe("uniqueViolationOf", () => {
  it("names the violated constraint, and only for a unique violation", () => {
    const wrapped = (code: string) => new DrizzleQueryError("insert", [], postgres(code, { constraint: "lobbies_code_unique" }));
    expect(uniqueViolationOf(wrapped("23505"))).toBe("lobbies_code_unique");
    expect(uniqueViolationOf(wrapped("23503"))).toBeUndefined();
  });
});

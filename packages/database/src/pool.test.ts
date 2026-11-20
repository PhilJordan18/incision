import { DrizzleQueryError } from "drizzle-orm/errors";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { createDatabasePool, describeDatabaseError } from "./pool";

describe("createDatabasePool", () => {
  it("is a plain pg.Pool, which Drizzle recognises in every bundled copy of pg", async () => {
    // Drizzle detects a pool by `instanceof Pool` or by a class name containing "Pool"; a
    // subclass minified by Next's bundler would match neither from the other copy of pg.
    const pool = createDatabasePool("postgresql://nobody@localhost:1/none");
    expect(Object.getPrototypeOf(pool)).toBe(pg.Pool.prototype);
    expect(pool.constructor.name).toContain("Pool");
    await pool.end();
  });
});

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
    const wrapped = new DrizzleQueryError("select * from missing where secret = $1", ["hunter2"], cause);
    expect(describeDatabaseError(wrapped)).toBe('42P01 relation "missing" does not exist');
  });

  it("recognises a query wrapper from another copy of drizzle-orm, as bundled by Next", () => {
    // Same shape as DrizzleQueryError, but not the class this module imports.
    class BundledQueryError extends Error {
      constructor(
        readonly query: string,
        readonly params: unknown[],
        cause: Error,
      ) {
        super(`Failed query: ${query}\nparams: ${params.join(",")}`, { cause });
      }
    }
    const cause = Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
    const wrapped = new BundledQueryError("select * from accounts where login = $1", ["alice", "scrypt$hash"], cause);
    expect(wrapped).not.toBeInstanceOf(DrizzleQueryError);
    expect(describeDatabaseError(wrapped)).toBe("ECONNRESET connection reset");
    expect(describeDatabaseError(new BundledQueryError("select $1", ["hunter2"], new Error("")))).not.toContain("hunter2");
  });

  it("omits the message of data exceptions, which quote the offending value", () => {
    const cause = Object.assign(new Error('invalid input syntax for type uuid: "secret-value"'), { code: "22P02" });
    const wrapped = new DrizzleQueryError("select * from accounts where id = $1", ["secret-value"], cause);
    expect(describeDatabaseError(wrapped)).toBe("22P02 data exception");
  });

  it("keeps only the code and names of a server error from a query with parameters", () => {
    // Some server messages quote a bound value, e.g. to_tsquery($1) or $1::regclass.
    const cause = Object.assign(new Error('no operand in tsquery: "SECRET-VALUE &"'), { code: "42601", severity: "ERROR" });
    const wrapped = new DrizzleQueryError("select to_tsquery($1)", ["SECRET-VALUE &"], cause);
    expect(describeDatabaseError(wrapped)).toBe("42601");
    const unique = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
      severity: "ERROR",
      constraint: "accounts_login_canonical_unique",
      table: "accounts",
    });
    expect(describeDatabaseError(new DrizzleQueryError("insert ...", ["alice"], unique))).toBe(
      "23505 constraint accounts_login_canonical_unique table accounts",
    );
  });

  it("keeps the server message of a query without parameters, such as a migration", () => {
    const cause = Object.assign(new Error('relation "missing" does not exist'), { code: "42P01", severity: "ERROR" });
    expect(describeDatabaseError(new DrizzleQueryError("select * from missing", [], cause))).toBe(
      '42P01 relation "missing" does not exist',
    );
  });

  it("stops on a cyclic cause instead of overflowing the stack", () => {
    const cyclic: Error & { cause?: unknown } = Object.assign(new Error("loop"), { query: "q", params: [] });
    cyclic.cause = cyclic;
    expect(describeDatabaseError(cyclic)).toBe("nested error");
  });

  it("keeps the message of other wrappers, such as pg-pool's connection timeout", () => {
    const timeout = new Error("Connection terminated due to connection timeout", {
      cause: new Error("Connection terminated unexpectedly"),
    });
    expect(describeDatabaseError(timeout)).toBe("Connection terminated due to connection timeout");
  });

  it("falls back to the error name when the message is empty", () => {
    expect(describeDatabaseError(new TypeError(""))).toBe("TypeError");
  });

  it("does not stringify unknown values that could carry configuration", () => {
    expect(describeDatabaseError({ connectionString: "postgresql://u:p@h/db" })).toBe("unknown error");
  });
});

import { CallbackRouteError, CredentialsSignin, JWTSessionError } from "@auth/core/errors";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logAuthError } from "./log";

const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

afterEach(() => {
  errorLog.mockClear();
});

function logged(): string {
  return errorLog.mock.calls.map((call) => call.join(" ")).join("\n");
}

describe("logAuthError", () => {
  it("logs a failed credential sign-in by type only", () => {
    logAuthError(new CredentialsSignin());
    expect(logged()).toBe("[auth] CredentialsSignin");
  });

  it("logs the name and code of a wrapped database error, never its message or details", () => {
    const database = Object.assign(new Error('duplicate key value violates unique constraint "x"'), {
      code: "23505",
      detail: "Key (login_canonical)=(alice) already exists.",
    });
    const query = Object.assign(new Error("Failed query: select ... params: alice,scrypt$secret"), { cause: database });
    // Auth.js stores the original error as `cause.err`.
    logAuthError(new CallbackRouteError("", { cause: { err: query } }));
    logAuthError(new JWTSessionError("", { cause: { err: database } }));
    expect(logged()).toBe("[auth] CallbackRouteError (Error)\n[auth] JWTSessionError (Error 23505)");
    expect(logged()).not.toMatch(/alice|scrypt|params|Key/);
  });
});

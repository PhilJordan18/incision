import { CredentialsSignin } from "next-auth";
import * as oauth from "oauth4webapi";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logAuthError } from "./log";

const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

afterEach(() => {
  errorLog.mockClear();
});

function logged(): string {
  return errorLog.mock.calls.map((call) => call.join(" ")).join("\n");
}

/** Shaped like Auth.js' errors: a `type`, and the original error as `cause.err`. */
function authError(type: string, err: Error): Error {
  return Object.assign(new Error(`${type}. Read more at https://errors.authjs.dev`, { cause: { err } }), { type });
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
    logAuthError(authError("CallbackRouteError", query));
    logAuthError(authError("JWTSessionError", database));
    expect(logged()).toBe("[auth] CallbackRouteError (Error)\n[auth] JWTSessionError (Error 23505)");
    expect(logged()).not.toMatch(/alice|scrypt|params|Key/);
  });

  it("names the failed check of the OAuth library, which carries no value", () => {
    const check = Object.assign(new Error('unexpected "iss" (issuer) response parameter value'), {
      name: "OperationProcessingError",
      code: "OAUTH_INVALID_RESPONSE",
      cause: { expected: "https://authjs.dev", parameters: "code=secret-code&state=s" },
    });
    logAuthError(authError("CallbackRouteError", check));
    expect(logged()).toBe(
      '[auth] CallbackRouteError (OperationProcessingError OAUTH_INVALID_RESPONSE): unexpected "iss" (issuer) response parameter value',
    );
    expect(logged()).not.toMatch(/secret-code/);
  });

  it("keeps the values of a real OAuth library error out of the log", () => {
    // The library itself, not a copy of its message: a later version that put values in
    // its messages would fail here.
    const authorizationServer = { issuer: "https://discord.com" };
    const client = { client_id: "client-marker" };
    const parameters = new URLSearchParams({ code: "code-marker", state: "state-marker", iss: "https://iss-marker.example" });
    let thrown: unknown;
    try {
      oauth.validateAuthResponse(authorizationServer, client, parameters, oauth.skipStateCheck);
    } catch (error: unknown) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    logAuthError(authError("CallbackRouteError", thrown as Error));
    expect(logged()).toMatch(/^\[auth\] CallbackRouteError \(\w+ OAUTH_INVALID_RESPONSE\): /);
    expect(logged()).not.toMatch(/marker/);
  });
});

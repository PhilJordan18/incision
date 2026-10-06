import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_SIGN_IN, safeRedirectPath } from "./safe-redirect";
import { signInErrorKey } from "./sign-in-errors";

describe("signInErrorKey", () => {
  it.each([
    [undefined, undefined, undefined],
    ["CredentialsSignin", "invalid_credentials", "invalidCredentials"],
    ["CredentialsSignin", "credentials", "invalidCredentials"],
    ["CredentialsSignin", "rate_limited", "rateLimited"],
    ["OAuthCallbackError", undefined, "providerFailed"],
    ["AccessDenied", undefined, "providerFailed"],
    ["Configuration", undefined, "unavailable"],
    ["<script>alert(1)</script>", undefined, "unavailable"],
    [["CredentialsSignin"], undefined, undefined],
  ])("maps error %j with code %j to %s", (error, code, expected) => {
    expect(signInErrorKey(error, code)).toBe(expected);
  });
});

describe("safeRedirectPath", () => {
  it.each([
    ["/account", "/account"],
    ["/rooms/ABC234?tab=1", "/rooms/ABC234?tab=1"],
    ["https://evil.example/account", DEFAULT_AFTER_SIGN_IN],
    ["//evil.example", DEFAULT_AFTER_SIGN_IN],
    ["/\\evil.example", DEFAULT_AFTER_SIGN_IN],
    ["javascript:alert(1)", DEFAULT_AFTER_SIGN_IN],
    ["/..//evil.example", DEFAULT_AFTER_SIGN_IN],
    ["/%2e%2e//evil.example/x?y=1", DEFAULT_AFTER_SIGN_IN],
    ["/.//evil.example", DEFAULT_AFTER_SIGN_IN],
    ["/a/..//evil.example", DEFAULT_AFTER_SIGN_IN],
    ["/a/../account", "/account"],
    ["account", DEFAULT_AFTER_SIGN_IN],
    [undefined, DEFAULT_AFTER_SIGN_IN],
    [["/account"], DEFAULT_AFTER_SIGN_IN],
  ])("keeps %j as %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});

import { hashPassword, type LocalCredentials } from "@incision/database";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CLIENT_ADDRESS_HEADER } from "../http/client-address";
import { AttemptLimiter } from "./attempt-limiter";
import { authorizeCredentials, type CredentialsDependencies, InvalidCredentials, TooManyAttempts } from "./credentials";

const accountId = "0b6f3c1e-5d2a-4f7b-9c8e-1a2b3c4d5e6f";
let alice: LocalCredentials;

beforeAll(async () => {
  alice = { accountId, sessionVersion: 1, passwordHash: await hashPassword("correct horse") };
});

function dependencies(overrides: Partial<CredentialsDependencies> = {}): CredentialsDependencies {
  return {
    findCredentials: vi.fn(async (login: string) => (login === "alice" ? alice : undefined)),
    limiters: {
      login: new AttemptLimiter({ maxFailures: 2, windowMs: 60_000 }),
      address: new AttemptLimiter({ maxFailures: 3, windowMs: 60_000 }),
    },
    ...overrides,
  };
}

function request(address = "203.0.113.9"): Request {
  return new Request("http://localhost/api/auth/callback/credentials", { headers: { [CLIENT_ADDRESS_HEADER]: address } });
}

describe("authorizeCredentials", () => {
  it("returns our account id for the right password, whatever the login's case", async () => {
    expect(await authorizeCredentials({ login: " Alice ", password: "correct horse" }, request(), dependencies())).toEqual({ id: accountId });
  });

  it.each([
    ["a wrong password", { login: "alice", password: "wrong" }],
    ["an unknown login", { login: "nobody", password: "correct horse" }],
    ["a login that cannot exist", { login: "a b", password: "correct horse" }],
    ["a missing password", { login: "alice" }],
    ["a non-string value", { login: ["alice"], password: "correct horse" }],
    ["an oversized password", { login: "alice", password: "x".repeat(129) }],
  ])("refuses %s with the same generic error", async (_label, input) => {
    const error = await authorizeCredentials(input, request(), dependencies()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(InvalidCredentials);
    expect(error).toMatchObject({ code: "invalid_credentials" });
  });

  it("verifies against a decoy hash for an unknown login, so it costs as much as a wrong password", async () => {
    const timed = async (input: { login: string; password: string }) => {
      const start = performance.now();
      await authorizeCredentials(input, request(), dependencies()).catch(() => undefined);
      return performance.now() - start;
    };
    await timed({ login: "nobody", password: "warm-up" });
    const [unknown, wrong] = [await timed({ login: "nobody", password: "x" }), await timed({ login: "alice", password: "x" })];
    // Both run one scrypt derivation (tens of milliseconds); a missing decoy would be ~0 ms.
    expect(unknown).toBeGreaterThan(wrong / 3);
  });

  it("pauses a login after repeated failures, even with the right password", async () => {
    const deps = dependencies();
    for (const address of ["198.51.100.1", "198.51.100.2"]) {
      await expect(authorizeCredentials({ login: "alice", password: "wrong" }, request(address), deps)).rejects.toBeInstanceOf(InvalidCredentials);
    }
    await expect(authorizeCredentials({ login: "ALICE", password: "correct horse" }, request("198.51.100.3"), deps)).rejects.toBeInstanceOf(TooManyAttempts);
  });

  it("pauses an address that sprays many logins, without querying the database", async () => {
    const deps = dependencies();
    for (const login of ["u1", "u2", "u3"]) {
      await expect(authorizeCredentials({ login, password: "x" }, request(), deps)).rejects.toBeInstanceOf(InvalidCredentials);
    }
    vi.mocked(deps.findCredentials).mockClear();
    await expect(authorizeCredentials({ login: "alice", password: "correct horse" }, request(), deps)).rejects.toBeInstanceOf(TooManyAttempts);
    expect(deps.findCredentials).not.toHaveBeenCalled();
  });

  it("lets a database failure surface as an error, not as a wrong password", async () => {
    const deps = dependencies({ findCredentials: async () => Promise.reject(new Error("down")) });
    await expect(authorizeCredentials({ login: "alice", password: "correct horse" }, request(), deps)).rejects.toThrow("down");
  });
});

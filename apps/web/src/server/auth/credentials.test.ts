import { hashPassword, type LocalCredentials } from "@incision/database";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CLIENT_ADDRESS_HEADER } from "../http/client-address";
import { AttemptLimiter } from "./attempt-limiter";
import { authorizeCredentials, type CredentialsDependencies, InvalidCredentials, ServerBusy, TooManyAttempts } from "./credentials";

const accountId = "0b6f3c1e-5d2a-4f7b-9c8e-1a2b3c4d5e6f";
let alice: LocalCredentials;

beforeAll(async () => {
  alice = { accountId, sessionVersion: 1, passwordHash: await hashPassword("correct horse") };
});

function dependencies(overrides: Partial<CredentialsDependencies> = {}): CredentialsDependencies {
  return {
    findCredentials: vi.fn(async (login: string) => (login === "alice" ? alice : undefined)),
    limiters: {
      loginAtAddress: new AttemptLimiter({ maxFailures: 2, windowMs: 60_000 }),
      login: new AttemptLimiter({ maxFailures: 4, windowMs: 60_000 }),
      address: new AttemptLimiter({ maxFailures: 3, windowMs: 60_000 }),
      addressAttempts: new AttemptLimiter({ maxFailures: 6, windowMs: 60_000 }),
    },
    verifications: { inFlight: 0, perAddress: new Map(), max: { process: 8, perAddress: 8 } },
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

  it("pauses a login at one address after repeated failures, even with the right password", async () => {
    const deps = dependencies();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(authorizeCredentials({ login: "alice", password: "wrong" }, request(), deps)).rejects.toBeInstanceOf(InvalidCredentials);
    }
    await expect(authorizeCredentials({ login: "ALICE", password: "correct horse" }, request(), deps)).rejects.toBeInstanceOf(TooManyAttempts);
  });

  it("lets the owner in from another address while a stranger is paused, up to the global cap", async () => {
    const deps = dependencies();
    for (const address of ["198.51.100.1", "198.51.100.1"]) {
      await expect(authorizeCredentials({ login: "alice", password: "wrong" }, request(address), deps)).rejects.toBeInstanceOf(InvalidCredentials);
    }
    await expect(authorizeCredentials({ login: "alice", password: "correct horse" }, request("198.51.100.9"), deps)).resolves.toEqual({ id: accountId });
    for (const address of ["198.51.100.2", "198.51.100.3"]) {
      await expect(authorizeCredentials({ login: "alice", password: "wrong" }, request(address), deps)).rejects.toBeInstanceOf(InvalidCredentials);
    }
    // Four failures from anywhere: the login is paused for everyone.
    await expect(authorizeCredentials({ login: "alice", password: "correct horse" }, request("198.51.100.9"), deps)).rejects.toBeInstanceOf(TooManyAttempts);
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

  it("counts parallel attempts at once: a burst gets no more guesses than the limit", async () => {
    const deps = dependencies();
    const burst = await Promise.allSettled(
      Array.from({ length: 6 }, (_, index) => authorizeCredentials({ login: "alice", password: `wrong-${index}` }, request(`198.51.100.${index}`), deps)),
    );
    const reasons = burst.map((result) => (result.status === "rejected" ? result.reason : result.value));
    // The global per-login cap (4) holds even though every attempt comes from another address.
    expect(reasons.filter((reason) => reason instanceof InvalidCredentials)).toHaveLength(4);
    expect(reasons.filter((reason) => reason instanceof TooManyAttempts)).toHaveLength(2);
    expect(deps.findCredentials).toHaveBeenCalledTimes(4);
  });

  it("refuses new attempts while too many password checks are running", async () => {
    const deps = dependencies({ verifications: { inFlight: 0, perAddress: new Map(), max: { process: 2, perAddress: 8 } } });
    const burst = await Promise.allSettled(
      ["u1", "u2", "u3", "u4", "u5"].map((login, index) => authorizeCredentials({ login, password: "x" }, request(`203.0.113.${index}`), deps)),
    );
    const reasons = burst.map((result) => (result.status === "rejected" ? result.reason : result.value));
    expect(reasons.filter((reason) => reason instanceof ServerBusy)).toHaveLength(3);
    expect(deps.verifications.inFlight).toBe(0);
  });

  it("does not count a successful sign-in as a failure", async () => {
    const deps = dependencies();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(authorizeCredentials({ login: "alice", password: "correct horse" }, request(), deps)).resolves.toEqual({ id: accountId });
    }
  });

  it("limits the checks of one address, successful ones included, without refusing other addresses", async () => {
    // Failure limits out of the way: this test is about concurrency and attempts.
    const loose = { maxFailures: 50, windowMs: 60_000 };
    const deps = dependencies({
      limiters: {
        loginAtAddress: new AttemptLimiter(loose),
        login: new AttemptLimiter(loose),
        address: new AttemptLimiter(loose),
        addressAttempts: new AttemptLimiter({ maxFailures: 4, windowMs: 60_000 }),
      },
      verifications: { inFlight: 0, perAddress: new Map(), max: { process: 3, perAddress: 2 } },
    });
    // A flood of correct sign-ins from one address (the demo passwords are public).
    const flood = await Promise.allSettled(
      Array.from({ length: 5 }, () => authorizeCredentials({ login: "alice", password: "correct horse" }, request("198.51.100.66"), deps)),
    );
    expect(flood.filter((result) => result.status === "rejected" && result.reason instanceof ServerBusy)).toHaveLength(3);
    // While two of them run, another address still gets a slot.
    const [floodA, floodB] = [
      authorizeCredentials({ login: "alice", password: "correct horse" }, request("198.51.100.66"), deps),
      authorizeCredentials({ login: "alice", password: "correct horse" }, request("198.51.100.66"), deps),
    ];
    await expect(authorizeCredentials({ login: "alice", password: "correct horse" }, request("203.0.113.7"), deps)).resolves.toEqual({ id: accountId });
    await Promise.all([floodA, floodB]);
    // Four checked attempts from that address in the window: the next one is refused.
    await expect(authorizeCredentials({ login: "alice", password: "correct horse" }, request("198.51.100.66"), deps)).rejects.toBeInstanceOf(TooManyAttempts);
  });

  it("lets a database failure surface as an error, not as a wrong password", async () => {
    const deps = dependencies({ findCredentials: async () => Promise.reject(new Error("down")) });
    await expect(authorizeCredentials({ login: "alice", password: "correct horse" }, request(), deps)).rejects.toThrow("down");
  });

  it("does not count server failures: once the database answers, the right password works", async () => {
    let down = true;
    const deps = dependencies({
      findCredentials: async (login) => (down ? Promise.reject(new Error("down")) : login === "alice" ? alice : undefined),
    });
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await expect(authorizeCredentials({ login: "alice", password: "correct horse" }, request(), deps)).rejects.toThrow("down");
    }
    expect(deps.verifications.inFlight).toBe(0);
    down = false;
    await expect(authorizeCredentials({ login: "alice", password: "correct horse" }, request(), deps)).resolves.toEqual({ id: accountId });
  });
});

import { describe, expect, it, vi } from "vitest";
import { claimsForSignIn, revalidateClaims, type SessionStore } from "./session-callbacks";
import { sessionDeadline } from "./session-token";

const accountId = "0b6f3c1e-5d2a-4f7b-9c8e-1a2b3c4d5e6f";
const now = () => 1_800_000_000_500;

function store(overrides: Partial<SessionStore> = {}): SessionStore {
  return {
    readSessionVersion: vi.fn(async () => 2),
    findOrCreateOAuthAccount: vi.fn(async () => ({ accountId, sessionVersion: 5 })),
    ...overrides,
  };
}

describe("claimsForSignIn (simulated OAuth and credentials sign-ins)", () => {
  it("maps a GitHub identity to our account by provider and subject, seeding the display name", async () => {
    const sessions = store();
    const claims = await claimsForSignIn(
      { provider: "github", type: "oauth", providerAccountId: "583231" },
      { name: " The  Octocat " },
      { store: sessions, now },
    );
    expect(claims).toEqual({ sub: accountId, sessionVersion: 5, authTime: 1_800_000_000 });
    expect(sessions.findOrCreateOAuthAccount).toHaveBeenCalledWith({
      provider: "github",
      providerSubject: "583231",
      initialDisplayName: "The Octocat",
    });
  });

  it("gives a Discord account without a usable name a neutral display name", async () => {
    const sessions = store();
    await claimsForSignIn({ provider: "discord", type: "oauth", providerAccountId: "80351110224678912" }, { name: null }, { store: sessions, now });
    expect(sessions.findOrCreateOAuthAccount).toHaveBeenCalledWith(expect.objectContaining({ initialDisplayName: "discord-80351110224678912" }));
  });

  it("keeps the account id returned by authorize for credentials, with its current version", async () => {
    const claims = await claimsForSignIn({ provider: "credentials", type: "credentials", providerAccountId: accountId }, {}, { store: store(), now });
    expect(claims).toEqual({ sub: accountId, sessionVersion: 2, authTime: 1_800_000_000 });
  });

  it.each([
    ["an unknown provider", { provider: "google", type: "oauth", providerAccountId: "1" }],
    ["an empty subject", { provider: "github", type: "oauth", providerAccountId: "" }],
    ["credentials without our UUID", { provider: "credentials", type: "credentials", providerAccountId: "alice" }],
    ["a mismatched type", { provider: "github", type: "credentials", providerAccountId: accountId }],
  ])("refuses %s", async (_label, account) => {
    expect(await claimsForSignIn(account, {}, { store: store(), now })).toBeNull();
  });

  it("refuses credentials for an account deleted meanwhile", async () => {
    const sessions = store({ readSessionVersion: async () => null });
    expect(await claimsForSignIn({ provider: "credentials", type: "credentials", providerAccountId: accountId }, {}, { store: sessions, now })).toBeNull();
  });
});

describe("revalidateClaims", () => {
  const claims = { sub: accountId, sessionVersion: 2, authTime: 1_800_000_000 };

  it("keeps only our claims while the version matches", async () => {
    expect(await revalidateClaims({ ...claims, iat: 1, exp: 2, jti: "j", name: "x" }, { store: store(), now })).toEqual(claims);
  });

  it("refuses a revoked, expired or malformed session", async () => {
    expect(await revalidateClaims(claims, { store: store({ readSessionVersion: async () => 3 }), now })).toBeNull();
    expect(await revalidateClaims(claims, { store: store(), now: () => sessionDeadline(claims.authTime) })).toBeNull();
    expect(await revalidateClaims({ sub: accountId }, { store: store(), now })).toBeNull();
  });
});

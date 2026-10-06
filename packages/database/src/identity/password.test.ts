import { describe, expect, it } from "vitest";
import { hashPassword, PASSWORD_HASH_PARAMETERS, parsePasswordHash, verifyAgainstDecoy, verifyPassword } from "./password";

// The database check (accounts_password_hash_format) must accept everything hashPassword produces.
const DATABASE_FORMAT = /^scrypt\$[0-9]{2}\$[0-9]{1,2}\$[0-9]\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/;

describe("hashPassword", () => {
  it("salts every hash and records its parameters, in the format the database checks", async () => {
    const [first, second] = await Promise.all([hashPassword("correct horse"), hashPassword("correct horse")]);
    expect(first).not.toBe(second);
    expect(first).toMatch(DATABASE_FORMAT);
    const { logN, r, p } = PASSWORD_HASH_PARAMETERS;
    expect(first.startsWith(`scrypt$${logN}$${r}$${p}$`)).toBe(true);
    expect(parsePasswordHash(first)).toMatchObject({ logN, r, p });
  });
});

describe("verifyPassword", () => {
  it("accepts the right password and refuses another one", async () => {
    const hash = await hashPassword("Pâte-à-modeler 42");
    expect(await verifyPassword("Pâte-à-modeler 42", hash)).toBe(true);
    expect(await verifyPassword("pâte-à-modeler 42", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("treats canonically equivalent Unicode spellings as the same password (NFKC)", async () => {
    const hash = await hashPassword("café");
    expect(await verifyPassword("café", hash)).toBe(true);
  });

  it("refuses, without throwing, against a malformed stored hash", async () => {
    expect(await verifyPassword("anything", "not a hash")).toBe(false);
  });

  it("does the work of a verification for an unknown login", async () => {
    await expect(verifyAgainstDecoy("anything")).resolves.toBe(false);
  });
});

describe("parsePasswordHash", () => {
  const salt = Buffer.alloc(16, 7).toString("base64url");
  const key = Buffer.alloc(32, 9).toString("base64url");
  const valid = `scrypt$15$8$3$${salt}$${key}`;

  it("parses a well-formed hash", () => {
    expect(parsePasswordHash(valid)).toEqual({ logN: 15, r: 8, p: 3, salt: Buffer.alloc(16, 7), key: Buffer.alloc(32, 9) });
  });

  it.each([
    ["another algorithm", valid.replace("scrypt$", "bcrypt$")],
    ["a cost below the minimum", valid.replace("$15$", "$14$")],
    ["a cost above the maximum", valid.replace("$15$", "$17$")],
    ["a block size below 8", valid.replace("$15$8$", "$15$7$")],
    ["a block size above 8", valid.replace("$15$8$", "$15$16$")],
    ["a parallelism of 0", valid.replace("$8$3$", "$8$0$")],
    ["a parallelism above 4", valid.replace("$8$3$", "$8$5$")],
    ["a leading zero", valid.replace("$8$3$", "$08$3$")],
    ["a short salt", `scrypt$15$8$3$${salt.slice(1)}$${key}`],
    ["a short key", `scrypt$15$8$3$${salt}$${key.slice(1)}`],
    ["padding", `scrypt$15$8$3$${salt}$${key}=`],
    ["standard base64 characters", `scrypt$15$8$3$${salt.slice(0, -1)}+$${key}`],
    // 22 characters carry 132 bits; the last 4 must be zero for 16 bytes.
    ["non-canonical trailing bits", `scrypt$15$8$3$${salt.slice(0, -1)}D$${key}`],
    ["an extra field", `${valid}$extra`],
    ["surrounding spaces", ` ${valid}`],
    ["an empty value", ""],
  ])("refuses %s", (_label, stored) => {
    expect(parsePasswordHash(stored)).toBeNull();
  });
});

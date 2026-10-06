import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { usesVerifiedTls } from "./tls";

const base = "postgresql://user:secret@db.example/incision";
const certificateFolder = mkdtempSync(path.join(tmpdir(), "incision-tls-"));
const rootCert = path.join(certificateFolder, "root.crt");
writeFileSync(rootCert, "placeholder certificate");

afterAll(() => {
  rmSync(certificateFolder, { recursive: true, force: true });
});

describe("usesVerifiedTls", () => {
  // pg-connection-string warns about future `require` semantics on every parse.
  vi.spyOn(console, "warn").mockImplementation(() => undefined);

  it.each(["sslmode=verify-full", "sslmode=require", "sslmode=require&channel_binding=require"])(
    "accepts %s",
    (query) => {
      expect(usesVerifiedTls(`${base}?${query}`)).toBe(true);
    },
  );

  it.each([
    "",
    "?sslmode=disable",
    "?sslmode=no-verify",
    "?sslmode=verify-full&sslmode=disable",
    "?sslmode=require&uselibpqcompat=true",
    // Misspelled parameter: pg ignores it and would connect in clear text.
    "?ssl_mode=require",
  ])("refuses %j", (query) => {
    expect(usesVerifiedTls(`${base}${query}`)).toBe(false);
  });

  it.each(["verify-ca", "require"])("refuses libpq-compatible %s, which skips the host name check", (mode) => {
    expect(usesVerifiedTls(`${base}?uselibpqcompat=true&sslmode=${mode}&sslrootcert=${rootCert}`)).toBe(false);
  });

  it("accepts libpq-compatible verify-full with a root certificate, which checks the host name", () => {
    expect(usesVerifiedTls(`${base}?uselibpqcompat=true&sslmode=verify-full&sslrootcert=${rootCert}`)).toBe(true);
  });

  // The check is only sound if it parses URLs with the very copy pg uses: a pg upgrade
  // bringing its own pg-connection-string could give `require` another meaning.
  it("judges URLs with the same pg-connection-string as pg", () => {
    const require = createRequire(import.meta.url);
    const pgRequire = createRequire(require.resolve("pg"));
    expect(pgRequire.resolve("pg-connection-string")).toBe(require.resolve("pg-connection-string"));
  });
});

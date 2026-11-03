import { describe, expect, it } from "vitest";
import { parseCreationVisibility, parseVisibilityForm } from "./visibility-form";

function form(entries: readonly (readonly [string, string])[]) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("visibility forms (SALLE-03, CONF-11)", () => {
  it("creates by code when an older form sends no visibility, and keeps a valid choice", () => {
    expect(parseCreationVisibility(form([]))).toBe("code");
    for (const visibility of ["public", "code", "private"]) {
      expect(parseCreationVisibility(form([["visibility", visibility]]))).toBe(visibility);
    }
  });

  it.each([["PUBLIC"], ["invite"], [""], [" private"]])("refuses the creation value %j", (value) => {
    expect(parseCreationVisibility(form([["visibility", value]]))).toBeUndefined();
  });

  it("refuses a repeated creation field", () => {
    expect(parseCreationVisibility(form([["visibility", "public"], ["visibility", "private"]]))).toBeUndefined();
  });

  it("parses a change with the canonical code and the page's revision, ignoring forged fields", () => {
    expect(parseVisibilityForm(form([["code", "abcdef"], ["revision", "3"], ["visibility", "private"], ["accountId", "forged"]])))
      .toEqual({ code: "ABCDEF", revision: 3, visibility: "private" });
  });

  it.each([
    [[["revision", "3"], ["visibility", "public"]]],
    [[["code", "ABCDEF"], ["visibility", "public"]]],
    [[["code", "ABCDEF"], ["revision", "-1"], ["visibility", "public"]]],
    [[["code", "ABCDEF"], ["revision", "1.5"], ["visibility", "public"]]],
    [[["code", "ABCDEF"], ["revision", "2147483647"], ["visibility", "public"]]],
    [[["code", "ABCDEF"], ["revision", "3"], ["visibility", "secret"]]],
    [[["code", "ABCDEF"], ["revision", "3"], ["visibility", "public"], ["visibility", "private"]]],
    [[["code", "ABC0EF"], ["revision", "3"], ["visibility", "public"]]],
  ] as const)("refuses the change %j", (entries) => {
    expect(parseVisibilityForm(form(entries))).toBeUndefined();
  });
});

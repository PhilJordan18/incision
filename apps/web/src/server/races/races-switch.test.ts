import { describe, expect, it } from "vitest";
import { racesSwitchNotice, racesSwitchOf } from "./races-switch";

describe("RACES_ENABLED", () => {
  it("opens new races with the exact value true only", () => {
    expect(racesSwitchOf("true")).toBe("open");
    expect(racesSwitchOf(undefined)).toBe("closed");
    expect(racesSwitchOf("false")).toBe("closed");
    for (const value of ["TRUE", "True", " true", "true ", "1", "yes", "on", "enabled", "allowed"]) {
      expect(racesSwitchOf(value)).toBe("invalid");
    }
  });

  it("says at start-up whether races may start, and warns about an invalid value without showing it", () => {
    expect(racesSwitchNotice("open")).toEqual({ level: "info", message: "[races] RACES_ENABLED=true: new races may start" });
    expect(racesSwitchNotice("closed")).toMatchObject({ level: "info", message: expect.stringContaining("new races are closed") });
    const invalid = racesSwitchNotice("invalid");
    expect(invalid).toMatchObject({ level: "warn", message: expect.stringContaining("invalid value") });
    expect(invalid.message).toContain("new races are closed");
  });
});

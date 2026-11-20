import { describe, expect, it } from "vitest";
import { racesOpenOf, racesSwitchNotice, racesSwitchOf } from "./races-switch";

describe("RACES_ENABLED", () => {
  it("opens new races with the exact value true only", () => {
    expect(racesSwitchOf("true")).toBe("open");
    expect(racesSwitchOf(undefined)).toBe("closed");
    expect(racesSwitchOf("false")).toBe("closed");
    for (const value of ["TRUE", "True", " true", "true ", "1", "yes", "on", "enabled", "allowed"]) {
      expect(racesSwitchOf(value)).toBe("invalid");
    }
  });

  it("lets races start for the open switch only: an invalid value keeps them closed", () => {
    expect(racesOpenOf("open")).toBe(true);
    expect(racesOpenOf("closed")).toBe(false);
    expect(racesOpenOf("invalid")).toBe(false);
    expect(racesOpenOf(racesSwitchOf("TRUE"))).toBe(false);
  });

  it("says at start-up whether races may start, and warns about an invalid value without showing it", () => {
    expect(racesSwitchNotice("open")).toEqual({ level: "info", message: "[races] RACES_ENABLED=true: new races may start" });
    // docs/DEPLOYMENT.md quotes these three lines exactly, for the Log stream.
    expect(racesSwitchNotice("closed")).toEqual({
      level: "info",
      message: '[races] new races are closed (RACES_ENABLED is not "true"); rooms and stored results stay available',
    });
    expect(racesSwitchNotice("invalid")).toEqual({
      level: "warn",
      message: '[races] RACES_ENABLED has an invalid value; only "true" opens races: new races are closed',
    });
  });
});

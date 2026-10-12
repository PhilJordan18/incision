/**
 * RACES_ENABLED (decided on 12 October): only the exact value `true` lets new races start. Absent,
 * `false` or anything else, new starts are refused before the database (RACES_CLOSED), and the
 * application still starts: rooms, departures and stored results stay available. Read once at
 * start-up, so changing it restarts the process (on App Service, an app setting change does).
 */
export type RacesSwitch = "open" | "closed" | "invalid";

export function racesSwitchOf(value: string | undefined): RacesSwitch {
  if (value === "true") {
    return "open";
  }
  return value === undefined || value === "false" ? "closed" : "invalid";
}

/** The start-up line that says whether races may start; an invalid value is named, never shown. */
export function racesSwitchNotice(races: RacesSwitch): { readonly level: "info" | "warn"; readonly message: string } {
  switch (races) {
    case "open":
      return { level: "info", message: "[races] RACES_ENABLED=true: new races may start" };
    case "closed":
      return { level: "info", message: '[races] new races are closed (RACES_ENABLED is not "true"); rooms and stored results stay available' };
    case "invalid":
      return { level: "warn", message: '[races] RACES_ENABLED has an invalid value; only "true" opens races: new races are closed' };
  }
}

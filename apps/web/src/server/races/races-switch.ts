/**
 * RACES_ENABLED (decided on 12 October): only the exact value `true` lets new races start. Absent,
 * `false` or anything else, new starts are refused before the database (RACES_CLOSED), and the
 * application still starts: rooms, departures and stored results stay available. It is read
 * only at start-up, so a change takes effect after a restart (on App Service, changing an app
 * setting restarts the app).
 */
export type RacesSwitch = "open" | "closed" | "invalid";

export function racesSwitchOf(value: string | undefined): RacesSwitch {
  if (value === "true") {
    return "open";
  }
  return value === undefined || value === "false" ? "closed" : "invalid";
}

/** Whether new races may start: only an exact `true` opens them; an invalid value keeps them closed. */
export function racesOpenOf(races: RacesSwitch): boolean {
  return races === "open";
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

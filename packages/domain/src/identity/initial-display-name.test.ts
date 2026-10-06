import { describe, expect, it } from "vitest";
import { initialDisplayName } from "./initial-display-name";

const github = { provider: "github", subject: "583231" };

describe("initialDisplayName", () => {
  it("takes the first valid candidate, normalised", () => {
    expect(initialDisplayName(["  The   Octocat ", "octocat"], github)).toBe("The Octocat");
  });

  it("skips missing or invalid candidates (emoji sequence, too long, blank)", () => {
    expect(initialDisplayName([null, "👩‍💻", "x".repeat(41), "   ", "octocat"], github)).toBe("octocat");
  });

  it("falls back to the provider and its subject, then to the provider alone", () => {
    expect(initialDisplayName([undefined], github)).toBe("github-583231");
    expect(initialDisplayName([], { provider: "discord", subject: "1".repeat(60) })).toBe("discord");
  });
});

import { describe, expect, it } from "vitest";
import { filterPublicRooms, parsePublicRoomFilters, publicRoomEntrySchema, publicRoomFiltersQuery, type PublicRoomEntry } from "./public-rooms-protocol";

const entry: PublicRoomEntry = { code: "ABCDEF", hostName: "Julie", phase: "waiting", participants: 2, capacity: 30, textLanguage: "fr",
  complexity: "medium", textKind: "coherent", wordCount: 50, arcade: false, joinable: true };

describe("public room protocol (JOIN-02)", () => {
  it("accepts an entry and refuses extra fields such as ids or visibility", () => {
    expect(publicRoomEntrySchema.safeParse(entry).success).toBe(true);
    expect(publicRoomEntrySchema.safeParse({ ...entry, lobbyId: "x" }).success).toBe(false);
    expect(publicRoomEntrySchema.safeParse({ ...entry, visibility: "code" }).success).toBe(false);
    expect(publicRoomEntrySchema.safeParse({ ...entry, phase: "closed" }).success).toBe(false);
    expect(publicRoomEntrySchema.safeParse({ ...entry, code: "abcdef" }).success).toBe(false);
  });

  it("reads filters strictly: unknown or repeated values mean all", () => {
    expect(parsePublicRoomFilters({ language: "en", complexity: "hard" })).toEqual({ language: "en", complexity: "hard" });
    expect(parsePublicRoomFilters({ language: "de", complexity: "HARD" })).toEqual({});
    expect(parsePublicRoomFilters({ language: ["fr", "en"] })).toEqual({});
    expect(parsePublicRoomFilters({})).toEqual({});
  });

  it("filters by language and complexity, and writes the query back", () => {
    const rooms = [entry, { ...entry, code: "GHJKMN", textLanguage: "en" as const }, { ...entry, code: "PQRSTU", complexity: "hard" as const }];
    expect(filterPublicRooms(rooms, {}).map((room) => room.code)).toEqual(["ABCDEF", "GHJKMN", "PQRSTU"]);
    expect(filterPublicRooms(rooms, { language: "en" }).map((room) => room.code)).toEqual(["GHJKMN"]);
    expect(filterPublicRooms(rooms, { language: "fr", complexity: "hard" }).map((room) => room.code)).toEqual(["PQRSTU"]);
    expect(publicRoomFiltersQuery({})).toBe("");
    expect(publicRoomFiltersQuery({ language: "fr", complexity: "easy" })).toBe("?language=fr&complexity=easy");
  });
});

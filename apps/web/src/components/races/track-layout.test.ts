import { describe, expect, it } from "vitest";
import { LABEL_BOTTOM, LABEL_GAP, LABEL_TOP, ROUTE_COLOURS, routeStyles, standingsOrder, trackLayout } from "./track-layout";

const runners = (count: number) => Array.from({ length: count }, (_, i) => ({ entrantId: `runner-${String(i).padStart(2, "0")}`, kind: i % 4 === 0 ? "bot" as const : "human" as const,
  status: "racing" as const, position: i * 2, length: 100, netWpm: 40 + i, inactive: false }));

describe("track presentation layout", () => {
  it.each([2, 6, 30, 50])("keeps all %i runners, bounded positions and at most five non-overlapping labels", count => {
    const input = runners(count);
    const snapshot = JSON.stringify(input);
    const points = trackLayout(input, input[Math.floor(count / 2)]!.entrantId);
    expect(points).toHaveLength(count);
    expect(points.filter(p => p.self)).toHaveLength(1);
    const labels = points.filter(p => p.labelled).sort((a, b) => a.labelY - b.labelY);
    expect(labels.length).toBeLessThanOrEqual(5);
    for (const [i, point] of labels.entries()) {
      expect(point.labelY).toBeGreaterThanOrEqual(LABEL_TOP);
      expect(point.labelY).toBeLessThanOrEqual(LABEL_BOTTOM);
      if (i) expect(point.labelY - labels[i - 1]!.labelY).toBeGreaterThanOrEqual(LABEL_GAP - 0.01);
    }
    for (const point of points) {
      for (const value of [point.x, point.y, point.horizontalX, point.horizontalY]) {
        expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(100);
      }
    }
    expect(trackLayout([...input].reverse(), input[Math.floor(count / 2)]!.entrantId)).toEqual(points);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("keeps equal start/finish positions equal, never awards a winner from a tie", () => {
    for (const position of [0, 100]) {
      const points = trackLayout(runners(30).map(r => ({ ...r, position })), "runner-15");
      expect(new Set(points.map(p => p.y)).size).toBe(1);
      expect(points.some(p => p.tone === "leader")).toBe(false);
      const labels = points.filter(p => p.labelled).sort((a, b) => a.labelY - b.labelY);
      expect(labels[0]!.labelY).toBeGreaterThanOrEqual(LABEL_TOP);
      expect(labels.at(-1)!.labelY).toBeLessThanOrEqual(LABEL_BOTTOM);
    }
  });

  it("uses real relative progress, retains abandoned/inactive runners and does not extrapolate", () => {
    const [a, b] = runners(2);
    const points = trackLayout([{ ...a!, position: 10, length: 20, inactive: true }, { ...b!, position: 99, status: "abandoned" }], b!.entrantId);
    expect(points[0]!.y).toBe(51.5);
    expect(points[0]!.runner.inactive).toBe(true);
    expect(points[1]!.self).toBe(true);
    expect(points[1]!.labelled).toBe(true);
    expect(points[1]!.tone).toBe("self");
    expect(trackLayout([], null)).toEqual([]);
    expect(trackLayout(runners(30), null).filter(p => p.labelled)).toHaveLength(2);
  });
  it("orders the standings by progress, finishers first on a tie, those who gave up last, stably", () => {
    const base = { kind: "human" as const, length: 10, netWpm: 40, inactive: false };
    const input = [
      { ...base, entrantId: "d", status: "abandoned" as const, position: 9 },
      { ...base, entrantId: "c", status: "racing" as const, position: 10 },
      { ...base, entrantId: "b", status: "finished" as const, position: 10 },
      { ...base, entrantId: "a", status: "racing" as const, position: 4 },
      { ...base, entrantId: "e", status: "racing" as const, position: 4 },
      { ...base, entrantId: "f", status: "timedOut" as const, position: 0, length: 0 },
    ];
    const snapshot = JSON.stringify(input);
    expect(standingsOrder(input).map(r => r.entrantId)).toEqual(["b", "c", "a", "e", "f", "d"]);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("draws each route from the start to the real progress only, the marker at its end", () => {
    const input = runners(30);
    for (const point of trackLayout(input, "runner-15")) {
      const coords = point.path.split(" ").map(pair => pair.split(",").map(Number) as [number, number]);
      const ratio = point.runner.position / point.runner.length;
      // Lengthwise, a fact: the start, then never past the runner's progress.
      expect(coords[0]![1]).toBe(90);
      expect(Math.min(...coords.map(([, y]) => y))).toBeCloseTo(90 - 77 * ratio, 1);
      for (let i = 1; i < coords.length; i++) expect(coords[i]![1]).toBeLessThanOrEqual(coords[i - 1]![1]);
      expect(coords.at(-1)![0]).toBeCloseTo(point.x, 1); expect(coords.at(-1)![1]).toBeCloseTo(point.y, 1);
      const horizontal = point.horizontalPath.split(" ").map(pair => pair.split(",").map(Number) as [number, number]);
      expect(horizontal[0]![0]).toBe(5); expect(horizontal.at(-1)![0]).toBeCloseTo(5 + 88 * ratio, 1);
      expect(horizontal.at(-1)![1]).toBeCloseTo(point.horizontalY, 1);
      // Sideways, an ornament within the runner's own lane.
      for (const [x] of coords) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(60); }
    }
  });

  it("keeps routes and colours for a refresh, a reload and a reordered broadcast; resets with a new round", () => {
    const input = runners(50);
    const first = trackLayout(input, "runner-15");
    const reload = trackLayout([...input].reverse().map(r => ({ ...r })), "runner-15");
    expect(reload.map(p => [p.runner.entrantId, p.route, p.path])).toEqual(first.map(p => [p.runner.entrantId, p.route, p.path]));
    // Progress moves on: the same colour, the same lane, a longer route whose start is unchanged.
    const later = trackLayout(input.map(r => ({ ...r, position: Math.min(100, r.position + 10) })), "runner-15");
    for (const [i, point] of later.entries()) {
      expect(point.route).toEqual(first[i]!.route);
      expect(point.path.startsWith(first[i]!.path.split(" ")[0]!)).toBe(true);
      if (first[i]!.runner.position < 90) expect(point.path.length).toBeGreaterThan(first[i]!.path.length);
    }
    // A new round starts everyone at the start line again: nothing carried over.
    for (const point of trackLayout(input.map(r => ({ ...r, position: 0 })), "runner-15")) expect(point.path.split(" ").every(pair => pair.endsWith(",90"))).toBe(true);
  });

  it("gives me `moi` only, and others distinct colour × dash pairs among twelve neighbours", () => {
    const input = runners(50);
    const styles = routeStyles(input, "runner-15");
    expect(styles.get("runner-15")).toEqual({ colour: "moi", dash: "solid" });
    const others = input.filter(r => r.entrantId !== "runner-15").map(r => styles.get(r.entrantId)!);
    expect(others.every(style => (ROUTE_COLOURS as readonly string[]).includes(style.colour))).toBe(true);
    for (let i = 0; i + 12 <= others.length; i++) {
      expect(new Set(others.slice(i, i + 12).map(style => `${style.colour}/${style.dash}`)).size).toBe(12);
    }
    // A spectator sees no `moi` route.
    expect([...routeStyles(input, null).values()].some(style => style.colour === "moi")).toBe(false);
    // Close runners at the same progress keep separate lanes.
    const close = trackLayout(input.map(r => ({ ...r, position: 40 })), "runner-15");
    expect(new Set(close.map(p => p.x.toFixed(2))).size).toBe(50);
  });
});


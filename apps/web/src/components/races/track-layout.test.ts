import { describe, expect, it } from "vitest";
import { LABEL_BOTTOM, LABEL_GAP, LABEL_TOP, ROUTE_COLOURS, routeStyles, SHIP_BERTHS, HORIZONTAL_SHIP_BERTHS, NARROW_LANES, standingsOrder, trackLayout } from "./track-layout";

const runners = (count: number) => Array.from({ length: count }, (_, i) => ({ entrantId: `runner-${String(i).padStart(2, "0")}`, kind: i % 4 === 0 ? "bot" as const : "human" as const,
  status: "racing" as const, position: i * 2, length: 100, netWpm: 40 + i, inactive: false }));

/** The clearance two ships must keep, as `shipShifts` defines it. */
const clearance = (dy: number) => SHIP_BERTHS.clear * Math.max(0, Math.min(1, (SHIP_BERTHS.level - Math.abs(dy)) / SHIP_BERTHS.ease));
const drawnShips = (points: ReturnType<typeof trackLayout>) => points.filter(p => p.labelled).map(p => ({ id: p.runner.entrantId, x: p.x + p.shipShift, y: p.y, self: p.self, shift: p.shipShift }));
/** A small deterministic generator, so that a failure can be replayed. */
const sequence = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };

describe("named ships", () => {
  it.each([2, 6, 12, 30, 50])("keeps my ship clear among %i runners, level or nearly, and never draws a ship far from its marker", count => {
    const random = sequence(count);
    let stopped = 0;
    let pairs = 0;
    for (let round = 0; round < 400; round++) {
      // Level (ties at the start and the finish) or within a few percent of one another.
      const base = round < 3 ? [0, 40, 100][round]! : Math.floor(random() * 90);
      const spread = round < 3 ? 0 : Math.floor(random() * 12);
      const input = runners(count).map(r => ({ ...r, position: Math.min(100, base + Math.floor(random() * (spread + 1))) }));
      const selfId = input[Math.floor(random() * count)]!.entrantId;
      const points = trackLayout(input, selfId);
      const ships = drawnShips(points);
      const mine = ships.find(ship => ship.self)!;
      expect(mine.shift).toBe(0);
      for (const ship of ships) {
        // Never further from its marker than the tether's reach, never over the names' column.
        expect(Math.abs(ship.shift)).toBeLessThanOrEqual(SHIP_BERTHS.reach + 0.01);
        expect(ship.x).toBeGreaterThanOrEqual(SHIP_BERTHS.min - 0.01); expect(ship.x).toBeLessThanOrEqual(SHIP_BERTHS.max + 0.01);
        if (ship.self) continue;
        pairs++;
        // My ship is kept clear, unless the reach or the chart's edge stops the other one.
        const clear = Math.abs(ship.x - mine.x) >= clearance(ship.y - mine.y) - 0.02;
        const held = Math.abs(ship.shift) >= SHIP_BERTHS.reach - 0.01 || ship.x <= SHIP_BERTHS.min + 0.01 || ship.x >= SHIP_BERTHS.max - 0.01;
        if (!clear && held) stopped++; else expect(clear).toBe(true);
      }
      // The drawing alone shifts: every marker stays at the end of its own route.
      for (const point of points) expect(Number(point.path.split(" ").at(-1)!.split(",")[0])).toBeCloseTo(point.x, 1);
      expect(trackLayout([...input].reverse(), selfId)).toEqual(points);
    }
    // Held short of a full clearance by the reach or an edge: possible in a crew bunched on purpose, as
    // here, never the common case (under 3 % of the ships beside mine).
    expect(stopped).toBeLessThanOrEqual(pairs * 0.03);
  });

  it.each([2, 6, 12, 30, 50])("on a narrow chart, starts every ship right of the finish word and keeps mine clear as drawn, among %i runners", count => {
    const random = sequence(count + 101);
    const drawn = (x: number) => NARROW_LANES.offset + NARROW_LANES.scale * x;
    let stopped = 0; let pairs = 0; let hulls = 0;
    for (let round = 0; round < 400; round++) {
      const base = round < 3 ? [0, 40, 100][round]! : Math.floor(random() * 90);
      const spread = round < 3 ? 0 : Math.floor(random() * 12);
      const input = runners(count).map(r => ({ ...r, position: Math.min(100, base + Math.floor(random() * (spread + 1))) }));
      const points = trackLayout(input, input[Math.floor(random() * count)]!.entrantId);
      // Every lane is drawn right of 28 % (30 % less the routes' swing), a ship never left of it.
      for (const point of points) expect(drawn(point.x)).toBeGreaterThanOrEqual(30 - 2.4 * NARROW_LANES.scale - 0.01);
      const ships = points.filter(p => p.labelled).map(p => ({ x: drawn(p.x + p.narrowShipShift), y: p.y, self: p.self, shift: p.narrowShipShift * NARROW_LANES.scale }));
      const mine = ships.find(ship => ship.self)!;
      expect(mine.shift).toBe(0);
      for (const ship of ships) {
        expect(ship.x).toBeGreaterThanOrEqual(28); expect(ship.x).toBeLessThanOrEqual(SHIP_BERTHS.max + 0.01);
        expect(Math.abs(ship.shift)).toBeLessThanOrEqual(SHIP_BERTHS.reach + 0.01);
        if (ship.self) continue;
        pairs++;
        const gap = Math.abs(ship.x - mine.x);
        if (gap < clearance(ship.y - mine.y) - 0.02) stopped++;
        if (gap < clearance(ship.y - mine.y) * 0.7 - 0.02) hulls++;
      }
    }
    // The band is narrower (25 % instead of 39 %): in crews bunched on purpose, as here, a neighbour
    // is more often held short of the full clearance by its 10 % reach (measured: up to 10.5 % of
    // the ships beside mine with 50 runners), and its hull touches mine in up to 8.3 % of them.
    expect(stopped).toBeLessThanOrEqual(pairs * 0.12);
    expect(hulls).toBeLessThanOrEqual(pairs * 0.09);
  });

  it.each([6, 30, 50])("slides a ship by little between two small advances while the same runners are named, among %i runners", count => {
    const random = sequence(count + 7);
    const speeds = runners(count).map(() => 0.5 + random());
    let previous: ReturnType<typeof drawnShips> | undefined;
    let largest = 0;
    let compared = 0;
    for (let tick = 0; tick <= 400; tick++) {
      // Finer than a broadcast: every runner advances by at most 0.375 % of the text per step.
      const input = runners(count).map((r, i) => ({ ...r, position: Math.min(1000, tick * 2.5 * speeds[i]!), length: 1000 }));
      const ships = drawnShips(trackLayout(input, "runner-03"));
      // While the same runners are named, a ship's sideways offset changes by little, as its marker
      // does. (When a name appears or goes, the stylesheet's transition carries the ship across.)
      if (previous !== undefined && previous.map(other => other.id).join() === ships.map(other => other.id).join()) {
        for (const ship of ships) { compared++; largest = Math.max(largest, Math.abs(ship.shift - previous.find(other => other.id === ship.id)!.shift)); }
      }
      previous = ships;
    }
    expect(compared).toBeGreaterThan(500);
    expect(largest).toBeLessThan(2.5);
  });

  it("keeps a ship on the side of its own lane, whatever the routes' swing", () => {
    for (let position = 0; position <= 100; position += 1) {
      const points = trackLayout(runners(6).map(r => ({ ...r, position })), "runner-03");
      const mine = points.find(p => p.self)!;
      for (const [lane, point] of points.entries()) {
        if (!point.labelled || point.self) continue;
        expect(Math.sign(point.x + point.shipShift - mine.x)).toBe(lane < 3 ? -1 : 1);
      }
    }
  });

  it("leaves a ship on its marker when nothing is near, and berths a spectator's chart around its first lane", () => {
    const [a, b] = runners(2);
    expect(trackLayout([{ ...a!, position: 10 }, { ...b!, position: 80 }], a!.entrantId).map(p => p.shipShift)).toEqual([0, 0]);
    const watched = trackLayout(runners(12).map(r => ({ ...r, position: 50 })), null).filter(p => p.labelled);
    expect(watched).toHaveLength(2);
    expect(watched[0]!.shipShift).toBe(0);
    expect(watched[1]!.x + watched[1]!.shipShift - watched[0]!.x).toBeGreaterThanOrEqual(SHIP_BERTHS.clear - 0.02);
  });

  it("berths the leader on the side that has room when I sail by an edge of the tablet's chart", () => {
    for (const mineId of ["runner-00", "runner-11"]) {
      const leaderId = mineId === "runner-00" ? "runner-01" : "runner-10";
      const points = trackLayout(runners(12).map(r => ({ ...r, position: r.entrantId === leaderId ? 61 : r.entrantId === mineId ? 60 : 10 })), mineId);
      const mine = points.find(p => p.self)!; const leader = points.find(p => p.tone === "leader")!;
      expect(Math.abs(leader.horizontalY + leader.horizontalShipShift - mine.horizontalY)).toBeGreaterThanOrEqual(HORIZONTAL_SHIP_BERTHS.clear - 0.02);
    }
  });

  it("separates my ship and the leader's on the tablet's chart, and moves no other", () => {
    const input = runners(12).map(r => ({ ...r, position: r.entrantId === "runner-05" ? 61 : r.entrantId === "runner-06" ? 60 : 10 }));
    const points = trackLayout(input, "runner-06");
    const mine = points.find(p => p.self)!; const leader = points.find(p => p.tone === "leader")!;
    expect(mine.horizontalShipShift).toBe(0);
    expect(Math.abs(leader.horizontalY + leader.horizontalShipShift - mine.horizontalY)).toBeGreaterThanOrEqual(HORIZONTAL_SHIP_BERTHS.clear - 0.02);
    expect(Math.abs(leader.horizontalShipShift)).toBeLessThanOrEqual(HORIZONTAL_SHIP_BERTHS.reach);
    expect(points.filter(p => !p.self && p.tone !== "leader").every(p => p.horizontalShipShift === 0)).toBe(true);
  });
});

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

  it("brings a finished runner's route to the finish line", () => {
    const [done] = trackLayout([{ ...runners(1)[0]!, entrantId: "done", status: "finished" as const, position: 100, length: 100 }], null);
    const end = done!.path.split(" ").at(-1)!.split(",").map(Number);
    expect(end[1]).toBeCloseTo(13, 1);
    expect(done!.horizontalPath.split(" ").at(-1)!.split(",").map(Number)[0]).toBeCloseTo(93, 1);
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


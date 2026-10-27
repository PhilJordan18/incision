import { describe, expect, it } from "vitest";
import { trackLayout } from "./track-layout";

const runners = (count: number) => Array.from({ length: count }, (_, i) => ({ entrantId: `runner-${String(i).padStart(2, "0")}`, kind: i % 4 === 0 ? "bot" as const : "human" as const,
  status: "racing" as const, position: i * 2, length: 100, netWpm: 40 + i, inactive: false }));

describe("track presentation layout", () => {
  it.each([2, 6, 30, 50])("keeps all %i runners, bounded positions and at most six non-overlapping labels", count => {
    const input = runners(count);
    const snapshot = JSON.stringify(input);
    const points = trackLayout(input, input[Math.floor(count / 2)]!.entrantId);
    expect(points).toHaveLength(count);
    expect(points.filter(p => p.self)).toHaveLength(1);
    const labels = points.filter(p => p.labelled).sort((a, b) => a.labelY - b.labelY);
    expect(labels.length).toBeLessThanOrEqual(6);
    for (const [i, point] of labels.entries()) {
      expect(point.labelY).toBeGreaterThanOrEqual(14);
      expect(point.labelY).toBeLessThanOrEqual(86);
      if (i) expect(point.labelY - labels[i - 1]!.labelY).toBeGreaterThanOrEqual(11.99);
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
      expect(labels[0]!.labelY).toBeGreaterThanOrEqual(14);
      expect(labels.at(-1)!.labelY).toBeLessThanOrEqual(86);
    }
  });

  it("uses real relative progress, retains abandoned/inactive runners and does not extrapolate", () => {
    const [a, b] = runners(2);
    const points = trackLayout([{ ...a!, position: 10, length: 20, inactive: true }, { ...b!, position: 99, status: "abandoned" }], b!.entrantId);
    expect(points[0]!.y).toBe(52);
    expect(points[0]!.runner.inactive).toBe(true);
    expect(points[1]!.self).toBe(true);
    expect(points[1]!.labelled).toBe(true);
    expect(points[1]!.tone).toBe("self");
    expect(trackLayout([], null)).toEqual([]);
    expect(trackLayout(runners(30), null).filter(p => p.labelled)).toHaveLength(3);
  });
});

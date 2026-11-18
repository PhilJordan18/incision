import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ROUTE_COLOURS, ROUTE_DASHES, routeStyle } from "@/components/races/track-layout";
import { Coast, Compass, type NauticalRoute, Pennant, Quay, QUAY_MAX_HULLS, quayBerths, sailShape, Ship, SpectatorEye, WaveMarks } from ".";
import { waveMarkPositions } from "./shapes";

const render = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element);

describe("shape by kind", () => {
  it("gives a human a triangle and a bot a square, whatever else is known", () => {
    expect(sailShape("human")).toBe("triangle");
    expect(sailShape("bot")).toBe("square");
    expect(sailShape(undefined)).toBe("triangle");
  });

  it.each(["human", "bot"] as const)("draws the same shape on the ship and the pennant of a %s", kind => {
    const shape = sailShape(kind);
    const ship = render(createElement(Ship, { kind, colour: "juste" }));
    const pennant = render(createElement(Pennant, { kind, colour: "juste", dash: "dashed" }));
    expect(ship).toContain(`data-sail="${shape}"`);
    expect(pennant).toContain(`data-pennant="${shape}"`);
    // The cloth itself is the shape: a rectangle for a bot, a three-point path for a human.
    expect(/<rect[^>]*data-sail-cloth/.test(ship)).toBe(kind === "bot");
    expect(/<rect[^>]*data-pennant-cloth/.test(pennant)).toBe(kind === "bot");
    expect(/<path[^>]*data-sail-cloth/.test(ship)).toBe(kind === "human");
    expect(/<path[^>]*data-pennant-cloth/.test(pennant)).toBe(kind === "human");
  });

  it("never lets colour, dash, self or leader change the shape", () => {
    for (const kind of ["human", "bot"] as const) {
      for (const colour of ["moi", ...ROUTE_COLOURS] as const) {
        for (const dash of ROUTE_DASHES) {
          expect(render(createElement(Pennant, { kind, colour, dash }))).toContain(`data-pennant="${sailShape(kind)}"`);
        }
        expect(render(createElement(Ship, { kind, colour, self: true, leader: true }))).toContain(`data-sail="${sailShape(kind)}"`);
      }
    }
  });

  it("moors a bot's hull under a square sail at the quay", () => {
    const html = render(createElement(Quay, { hulls: [{ kind: "human", self: true, colour: "moi" }, { kind: "bot" }] }));
    expect(html.match(/data-quay-hull="triangle"/g)).toHaveLength(1);
    expect(html.match(/data-quay-hull="square"/g)).toHaveLength(1);
  });
});

describe("runner colour and dash", () => {
  it("accepts the track's route styles as they are", () => {
    for (let index = 0; index < ROUTE_COLOURS.length * ROUTE_DASHES.length; index++) {
      const route: NauticalRoute = routeStyle(index, false);
      const html = render(createElement(Pennant, { kind: "human", ...route }));
      expect(html).toContain(`data-colour="${route.colour}"`);
      expect(html).toContain(`data-dash="${route.dash}"`);
    }
    const mine: NauticalRoute = routeStyle(0, true);
    expect(render(createElement(Ship, { kind: "human", colour: mine.colour, self: true }))).toContain('data-colour="moi"');
  });

  it("draws the rings only when asked", () => {
    expect(render(createElement(Ship, { kind: "human" })).match(/<circle/g)).toBeNull();
    expect(render(createElement(Ship, { kind: "human", self: true })).match(/<circle/g)).toHaveLength(2);
    expect(render(createElement(Ship, { kind: "bot", leader: true })).match(/<circle/g)).toHaveLength(1);
  });
});

describe("decorative drawings", () => {
  const drawings = {
    ship: createElement(Ship, { kind: "human" }), pennant: createElement(Pennant, { kind: "bot" }), eye: createElement(SpectatorEye),
    coast: createElement(Coast), verticalCoast: createElement(Coast, { orientation: "vertical" }), waves: createElement(WaveMarks),
    compass: createElement(Compass), quay: createElement(Quay, { hulls: [{ kind: "human" }], more: "+3 au mouillage" }),
  };
  it.each(Object.entries(drawings))("hides the %s from assistive technology and writes no colour", (_name, element) => {
    const html = render(element);
    expect(html.match(/^<(svg|div)[^>]*aria-hidden="true"/)).not.toBeNull();
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(html).not.toMatch(/<(img|image|animate|a|button)\b/);
    expect(html).not.toContain("tabindex");
  });

  it("draws the coast along the top or along the right", () => {
    expect(render(createElement(Coast))).toContain('data-coast="horizontal"');
    expect(render(createElement(Coast))).toContain('d="M0 0 L0 78');
    expect(render(createElement(Coast, { orientation: "vertical" }))).toContain('d="M100 0 L22 0');
  });

  it("always scatters the same wave marks on the same box", () => {
    expect(waveMarkPositions(220, 90)).toEqual(waveMarkPositions(220, 90));
    expect(waveMarkPositions(220, 90).every(([x, y]) => x >= 0 && x <= 220 && y >= 0 && y <= 90)).toBe(true);
    expect(waveMarkPositions(0, 0)).toEqual([]);
  });
});

describe("bounded quay", () => {
  it("never draws more than eight hulls, then leaves the count to the caller's text", () => {
    const hulls = Array.from({ length: 50 }, (_, i) => ({ kind: i % 4 === 0 ? "bot" as const : "human" as const }));
    const html = render(createElement(Quay, { hulls, more: "+42 au mouillage" }));
    expect(html.match(/data-quay-hull=/g)).toHaveLength(QUAY_MAX_HULLS);
    expect(html).toContain("+42 au mouillage");
    expect(render(createElement(Quay, { hulls: hulls.slice(0, 3) }))).not.toContain("<text");
  });

  it("splits a crew into moored hulls and the rest", () => {
    expect(quayBerths(0)).toEqual({ moored: 0, beyond: 0 });
    expect(quayBerths(8)).toEqual({ moored: 8, beyond: 0 });
    expect(quayBerths(16)).toEqual({ moored: 8, beyond: 8 });
    expect(quayBerths(-2)).toEqual({ moored: 0, beyond: 0 });
    expect(quayBerths(Number.NaN)).toEqual({ moored: 0, beyond: 0 });
  });
});

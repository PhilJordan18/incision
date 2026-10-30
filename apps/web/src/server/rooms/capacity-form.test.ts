import { describe, expect, it } from "vitest";
import { parseCapacityForm } from "./capacity-form";
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ code: "ABCDEF", revision: "12", capacity: "30" })) data.set(key, value);
  return data;
}
describe("capacity form", () => {
  it("parses bounds", () => {
    for (const capacity of ["2", "30"]) {
      const data = form(); data.set("capacity", capacity);
      expect(parseCapacityForm(data)).toEqual({ code: "ABCDEF", revision: 12, capacity: Number(capacity) });
    }
  });
  it.each(["1", "31", "2.5", "2e1", "+2", " 2", "", "NaN"])("rejects %s", (value) => {
    const data = form(); data.set("capacity", value); expect(parseCapacityForm(data)).toBeUndefined();
  });
  it.each(["code", "revision", "capacity"])("rejects duplicate and missing %s", (key) => {
    const data = form(); data.append(key, "2"); expect(parseCapacityForm(data)).toBeUndefined();
    data.delete(key); expect(parseCapacityForm(data)).toBeUndefined();
  });
  it("rejects an overflowing revision", () => {
    const data = form(); data.set("revision", "2147483647"); expect(parseCapacityForm(data)).toBeUndefined();
  });
});

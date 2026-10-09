import { beforeEach, describe, expect, it } from "vitest";
import { readSavedClipping } from "./clipping";

describe("readSavedClipping", () => {
  beforeEach(() => localStorage.clear());

  it("returns saved longitude and latitude pairs", () => {
    localStorage.setItem("clip", JSON.stringify([[121.2, 25.1], [121.3, 25.2]]));
    expect(readSavedClipping("clip")).toEqual([
      [121.2, 25.1],
      [121.3, 25.2]
    ]);
  });

  it("ignores malformed coordinates", () => {
    localStorage.setItem(
      "clip",
      JSON.stringify([[121.2, 25.1], ["x", 25.2], [1]])
    );
    expect(readSavedClipping("clip")).toEqual([[121.2, 25.1]]);
  });

  it("returns an empty array for invalid JSON", () => {
    localStorage.setItem("clip", "{");
    expect(readSavedClipping("clip")).toEqual([]);
  });
});

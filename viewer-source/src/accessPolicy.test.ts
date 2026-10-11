import { expect, it } from "vitest";
import { isSharedViewerEntry } from "./accessPolicy";

it("shared routes stay viewer-only regardless of a previous admin role", () => {
  expect(isSharedViewerEntry("/3d-viewer/p/H4mT8qP2vK6x/", "admin")).toBe(true);
  expect(isSharedViewerEntry("/3d-viewer/c/comparison/", "admin")).toBe(true);
  expect(isSharedViewerEntry("/3d-viewer/", "viewer")).toBe(true);
});
it("the management entry retains its navigation and administrator controls", () => {
  expect(isSharedViewerEntry("/3d-viewer/", "admin")).toBe(false);
  expect(isSharedViewerEntry("/", undefined)).toBe(false);
});

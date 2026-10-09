import { describe, expect, it } from "vitest";
import { ConfigurationError } from "./config";
import { toViewerError } from "./errors";

describe("toViewerError", () => {
  it("preserves configuration guidance", () => {
    expect(toViewerError(new ConfigurationError("缺少設定"))).toBe("缺少設定");
  });

  it("describes authorization failures", () => {
    expect(toViewerError(new Error("Request failed with status 403"))).toContain(
      "assets:read"
    );
  });

  it("describes general loading failures", () => {
    expect(toViewerError(new Error("Network error"))).toContain("Network error");
  });
});

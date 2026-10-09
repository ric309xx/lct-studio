import { describe, expect, it } from "vitest";
import { ConfigurationError, parseConfig } from "./config";

function env(values: Record<string, string | undefined>): ImportMetaEnv {
  return values as ImportMetaEnv;
}

describe("parseConfig", () => {
  it("parses a valid token and asset id", () => {
    expect(
      parseConfig(
        env({
          VITE_CESIUM_ION_ACCESS_TOKEN: "token",
          VITE_CESIUM_ION_ASSET_ID: "5094702"
        })
      )
    ).toEqual({
      accessToken: "token",
      modelSource: { type: "cesium-ion", assetId: 5094702 }
    });
  });

  it("uses the planned asset id by default", () => {
    expect(
      parseConfig(env({ VITE_CESIUM_ION_ACCESS_TOKEN: "token" })).modelSource
    ).toEqual({ type: "cesium-ion", assetId: 5094702 });
  });

  it("rejects a missing token", () => {
    expect(() => parseConfig(env({}))).toThrow(ConfigurationError);
  });

  it.each(["0", "-1", "abc", "2.5"])("rejects invalid asset id %s", (assetId) => {
    expect(() =>
      parseConfig(
        env({
          VITE_CESIUM_ION_ACCESS_TOKEN: "token",
          VITE_CESIUM_ION_ASSET_ID: assetId
        })
      )
    ).toThrow("Asset ID 無效");
  });
});

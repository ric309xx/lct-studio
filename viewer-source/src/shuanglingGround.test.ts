import {describe,it,expect} from "vitest";
import {profileHeight,roadGround} from "./shuanglingGround";
import {readFileSync} from "node:fs";

describe("雙嶺段道路起伏與原地切換", () => {
  it("道路採用密集剖面與切片，不再鋪單一水平面", () => {
    expect(roadGround.pieces.length).toBeGreaterThan(150);
    const heights=roadGround.profile.map(p=>p[1]);
    expect(Math.max(...heights)-Math.min(...heights)).toBeGreaterThan(1);
    for(const [lat,h] of roadGround.profile) expect(profileHeight(lat)).toBeCloseTo(h,5);
    const a=roadGround.profile[10],b=roadGround.profile[11];
    expect(profileHeight((a[0]+b[0])/2)).toBeCloseTo((a[1]+b[1])/2,4);
    expect(roadGround.boundary[0]).toEqual(roadGround.boundary.at(-1));
  });
  it("同區選單與點選皆先走既有 Viewer，標示隨目前地號更新", () => {
    const source=readFileSync('src/App.tsx','utf8');
    const fn=source.slice(source.indexOf('const selectCadastralParcel ='),source.indexOf('const changeLandmarksVisibility ='));
    expect(fn.indexOf('selectParcelInPlaceRef.current?.(parcelKey)')).toBeLessThan(fn.indexOf('setReloadKey'));
    expect(source).toContain('if (parcel.groupKey && selectParcelInPlaceRef.current?.(parcel.key)) return;');
    expect(source).toContain('labelParcel.key === selectedParcelKeyRef.current');
  });
});

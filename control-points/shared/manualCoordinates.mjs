import {coordinateSearch} from './coordinateSearch.mjs';
import {toLonLat} from './coordinates.mjs';
var invalid = (message) => Object.assign(new Error(message), { status: 400 });
function manualCoordinates(data) {
  const epsg = Number(data.epsg), coordinateSystem = epsg === 4326 ? "WGS84" : "TWD97";
  if (![3826, 3825, 4326].includes(epsg) || data.coordinateSystem !== coordinateSystem) throw invalid("請選擇 TWD97 的 121／119 分帶或 WGS84 經緯度");
  let north, east, lon, lat;
  if (epsg === 4326) {
    if (typeof data.coordinates !== "string" || data.coordinates.length > 120) throw invalid("經緯度請填寫 120 字以內");
    let location;
    try {
      location = coordinateSearch(data.coordinates);
    } catch (e) {
      throw invalid(e.message);
    }
    if (!location) throw invalid("請輸入「緯度, 經度」，例如 23.575861, 120.707583");
    ({ lon, lat } = location);
    north = lat;
    east = lon;
  } else {
    if (data.north == null || data.east == null || String(data.north).trim() === "" || String(data.east).trim() === "") throw invalid("請輸入 N 縱坐標及 E 橫坐標");
    north = Number(data.north);
    east = Number(data.east);
    if (!Number.isFinite(north) || !Number.isFinite(east)) throw invalid("N／E 坐標必須是有效數字");
    [lon, lat] = toLonLat(east, north, epsg);
  }
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < 117 || lon > 125 || lat < 20 || lat > 28) throw invalid("位置超出台灣周邊，請檢查分帶、N／E 或經緯度順序");
  const height = data.height == null || String(data.height).trim() === "" ? null : Number(data.height);
  if (height !== null && !Number.isFinite(height)) throw invalid("高度必須是有效數字");
  if (!["未註明", "正高", "橢球高"].includes(data.height_type)) throw invalid("請選擇高程類型");
  const height_datum = String(data.height_datum || "").trim();
  if (height_datum.length > 100) throw invalid("高程基準請填寫 100 字以內");
  return { epsg, coordinateSystem, north, east, lon, lat, height, height_type: data.height_type, height_datum: height_datum || null };
}
export {manualCoordinates};

var formatError = () => new Error(`經緯度格式不正確，請輸入「23.575861, 120.707583」或「23\xB034'33.1"N 120\xB042'27.3"E」。`);
var component = `[NSEW]?\\s*[+-]?\\d+(?:\\.\\d+)?(?:\\s*\xB0(?:\\s*\\d+(?:\\.\\d+)?\\s*'(?:\\s*\\d+(?:\\.\\d+)?\\s*")?)?)?\\s*[NSEW]?`;
var pair = new RegExp(`^(${component})\\s*(?:[,;]|\\s)\\s*(${component})$`);
var parts = /^([NSEW])?\s*([+-]?\d+(?:\.\d+)?)(?:\s*°(?:\s*(\d+(?:\.\d+)?)\s*'(?:\s*(\d+(?:\.\d+)?)\s*")?)?)?\s*([NSEW])?$/;
function coordinateSearch(query) {
  const q = String(query ?? "").trim().toUpperCase().replace(/[º度]/g, "\xB0").replace(/[′’‘分]/g, "'").replace(/[″”“秒]/g, '"').replace(/[，；]/g, (c) => c === "，" ? "," : ";");
  const match2 = q.match(pair);
  if (!match2) {
    if (/[°'"NSEW]/.test(q) && /^[\d+\-.\s°'",;NSEW]+$/.test(q)) throw formatError();
    return null;
  }
  const values = match2.slice(1).map((text) => {
    const [, prefix, degrees, minutes, seconds, suffix] = text.trim().match(parts);
    if (prefix && suffix && prefix !== suffix) throw formatError();
    const direction = prefix || suffix, minute = Number(minutes || 0), second = Number(seconds || 0);
    if (minute >= 60 || second >= 60) throw new Error("經緯度的分、秒必須小於 60。");
    if (minutes && Number(degrees) % 1 !== 0 || seconds && minute % 1 !== 0) throw formatError();
    const negative = degrees.startsWith("-"), positive = degrees.startsWith("+");
    if (direction && (negative && /[NE]/.test(direction) || positive && /[SW]/.test(direction))) throw formatError();
    const sign = direction ? /[SW]/.test(direction) ? -1 : 1 : negative ? -1 : 1;
    return { value: sign * (Math.abs(Number(degrees)) + minute / 60 + second / 3600), axis: direction ? /[NS]/.test(direction) ? "lat" : "lon" : null };
  });
  if (values[0].axis && values[1].axis) {
    if (values[0].axis === values[1].axis) throw formatError();
    if (values[0].axis === "lon") values.reverse();
  } else if (values[0].axis === "lon" || values[1].axis === "lat") throw formatError();
  const [lat, lon] = values.map((v) => v.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error("經緯度超出範圍：緯度須為 -90～90，經度須為 -180～180。");
  return { id: `coordinates:${lat},${lon}`, name: `${lat.toFixed(6)}, ${lon.toFixed(6)}`, address: "WGS84 經緯度", lat, lon };
}
export {coordinateSearch};

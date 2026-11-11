var problem2 = (message, status = 400) => Object.assign(new Error(message), { status });
function fieldLayerSettings(data) {
  if (typeof data.name !== "string" || !data.name.trim() || data.name.length > 100) throw problem2("請填寫 100 字以內的圖層名稱");
  if (!Number.isInteger(data.resultYear) || data.resultYear < 1 || data.resultYear > 300 || typeof data.color !== "string" || !/^#[a-f0-9]{6}$/i.test(data.color)) throw problem2("年份或顏色不正確");
  return { name: data.name.trim(), resultYear: data.resultYear, color: data.color };
}

function editFieldLayer(dataset, data) {
  const metadata = JSON.parse(dataset.metadata || "{}");
  if (metadata.fieldLayer !== true) throw problem2("此功能僅供修改手動新增的圖層", 403);
  if (data.expectedName !== dataset.name || data.expectedMetadata !== dataset.metadata) throw problem2("圖層已更新，請關閉視窗並重新開啟後再修改", 409);
  const { name, resultYear, color } = fieldLayerSettings(data);
  return { ...dataset, name, metadata: JSON.stringify({ ...metadata, resultYear, color }) };
}
export {fieldLayerSettings, editFieldLayer};

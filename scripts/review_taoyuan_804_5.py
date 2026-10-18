"""依使用者紅線局部修正 804-5；保留其他地號及原始地籍。"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--packages', type=Path, required=True)
parser.add_argument('--work', type=Path, required=True)
args = parser.parse_args()
sys.path.insert(0, str(args.packages.resolve()))

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from pyproj import Transformer
from shapely import contains_xy
from shapely.geometry import Polygon, mapping, shape
from shapely.ops import transform

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'analysis/20261016-taoyuan-1015'
KEY = 'dongliao-804-5'
VERSION = '20261019-804-5-redline-review-v8'
relative = Path('overlays/taoyuan-1015/dongliao-1015-02.geojson')
public = ROOT / 'viewer-source/public'
published = ROOT / '3d-viewer'
catalog_path = ROOT / 'viewer-source/src/taoyuan1015Parcels.json'
audit_path = OUT / 'import-analysis-audit.json'
backup = args.work / 'before-804-5-v8'
backup.mkdir(parents=True, exist_ok=True)

def read(path):
    return json.loads(path.read_text(encoding='utf8'))

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf8')

for path in [public / relative, published / relative, catalog_path, audit_path]:
    target = backup / ('published-' + path.name if path == published / relative else path.name)
    if not target.exists():
        target.write_bytes(path.read_bytes())

baseline = read(backup / relative.name)
catalog_before = read(catalog_path)
audit_before = read(audit_path)
old_catalog = read(backup / catalog_path.name)
inventory = next(r for r in read(args.work / 'inventory.json') if r['handle'] == '46F')
region = next(r for r in read(OUT / 'model-regions.json')['regions'] if r['id'] == 'dongliao-804-projection')
forward = Transformer.from_crs(3826, 4326, always_xy=True).transform
inverse = Transformer.from_crs(4326, 3826, always_xy=True).transform
old_feature = next(f for f in baseline['features'] if f['properties']['kind'] == 'occupancy-building')
land_feature = next(f for f in baseline['features'] if f['properties']['kind'] == 'cadastral-fill')
old_footprint = transform(inverse, shape(old_feature['geometry']))
land = transform(inverse, shape(land_feature['geometry']))
x0, y0, x1, y1 = inventory['imageBounds']
w, h = inventory['imageSize']
roi = Polygon([(x0 + x / w * (x1 - x0), y1 - y / h * (y1 - y0)) for x, y in region['pixels']])
footprint = old_footprint.intersection(roi).intersection(land)
assert footprint.is_valid and footprint.geom_type == 'Polygon' and 0 < footprint.area < old_footprint.area
assert footprint.difference(old_footprint).area < 1e-8

points = np.load(args.work / '46F-points.npz')['points']
mask = contains_xy(roi, points[:, 0], points[:, 1])
low, high = region['heightRange']
selected = points[mask & (points[:, 2] >= low) & (points[:, 2] <= high)]
assert len(selected) > 100

# 擬合僅供校準與不支援模型分類時的顯示備援，不用平面反推 XY。
origin = selected[:, :2].mean(axis=0)
q = selected[::max(1, len(selected) // 5000), :3]
design = np.c_[q[:, :2] - origin, np.ones(len(q))]
rng = np.random.default_rng(1015)
best = None
score = 0
for _ in range(45):
    ids = rng.choice(len(q), 3, replace=False)
    try:
        coefficients = np.linalg.solve(design[ids], q[ids, 2])
    except np.linalg.LinAlgError:
        continue
    if np.hypot(coefficients[0], coefficients[1]) > 1:
        continue
    good = np.abs(design @ coefficients - q[:, 2]) < .15
    if good.sum() > score:
        best, score = good, int(good.sum())
assert best is not None and score >= 12
plane = np.linalg.lstsq(design[best], q[best, 2], rcond=None)[0]
samples = []
for distance in np.arange(0, footprint.exterior.length, .5):
    point = footprint.exterior.interpolate(distance)
    z = float(np.r_[point.x - origin[0], point.y - origin[1], 1] @ plane)
    samples.append([*forward(point.x, point.y), z])

feature = copy.deepcopy(old_feature)
feature['geometry'] = mapping(transform(forward, footprint))
properties = feature['properties']
properties.update(projectedAreaM2=footprint.area, modelRoofSamples=samples,
                  displayActualSurface=True, displayHeightRangeSourceZ=region['displayHeightRange'],
                  analysisVersion=VERSION, reviewNote=region['reviewNote'])
fc = read(public / relative)
assert [f for f in fc['features'] if f['properties'].get('kind', '').startswith('cadastral-')] == baseline['features'][:2]
fc['features'] = [feature if f['id'] == feature['id'] else f for f in fc['features']]
assert [f for f in fc['features'] if f['id'] != feature['id']] == [f for f in baseline['features'] if f['id'] != feature['id']]
for base in [public, published]:
    write(base / relative, fc)

catalog = copy.deepcopy(catalog_before)
parcel = next(p for p in catalog if p['key'] == KEY)
registered = parcel['info']['cadastralAreaM2']
parcel['info'].update(occupiedAreaM2=round(footprint.area, 4),
                      occupancyPercent=round(footprint.area / registered * 100, 5), analysisVersion=VERSION,
                      analysisNote='待複核；依使用者 2026-10-19 紅線收進突出構造左側及斜上緣，與原已判讀範圍及 TWD97 地籍求交集重算。綠色僅著於指定高度的實際模型表面；不新增假面、不計電線及路面。')
assert [p for p in catalog if p['key'] != KEY] == [p for p in catalog_before if p['key'] != KEY]
write(catalog_path, catalog)

# 本次不改前端邏輯；局部同步現有包內該筆 JSON，避免顯示舊面積。
# 用 JSON 解碼器確認完整物件邊界，不對整包做數字字串替換。
bundle_path = published / 'assets/viewer.js'
bundle = bundle_path.read_bytes().decode('utf8')
marker = '{"key":"' + KEY + '"'
assert bundle.count(marker) == 1
start = bundle.index(marker)
embedded, length = json.JSONDecoder().raw_decode(bundle[start:])
assert embedded['key'] == KEY
embedded_before = copy.deepcopy(embedded)
embedded['info'].update({k: parcel['info'][k] for k in ['occupiedAreaM2', 'occupancyPercent', 'analysisVersion', 'analysisNote']})
assert {k: v for k, v in embedded.items() if k != 'info'} == {k: v for k, v in embedded_before.items() if k != 'info'}
if not (backup / 'viewer.js').exists():
    (backup / 'viewer.js').write_bytes(bundle_path.read_bytes())
replacement = json.dumps(embedded, ensure_ascii=False, separators=(',', ':'))
original_bundle = (backup / 'viewer.js').read_bytes().decode('utf8')
original_start = original_bundle.index(marker)
_, original_length = json.JSONDecoder().raw_decode(original_bundle[original_start:])
# 保留原始換行及物件以外的每個位元組，也拒絕蓋掉其他人的並行修改。
assert original_bundle[:original_start].replace('\r\n', '\n') == bundle[:start].replace('\r\n', '\n')
assert original_bundle[original_start + original_length:].replace('\r\n', '\n') == bundle[start + length:].replace('\r\n', '\n')
bundle_path.write_bytes((original_bundle[:original_start] + replacement + original_bundle[original_start + original_length:]).encode('utf8'))

audit = copy.deepcopy(audit_before)
item = next(p for p in audit['parcels'] if p['handle'] == '46F')
item.update(occupiedAreaM2=footprint.area, selectedPoints=len(selected), footprintTwd97=mapping(footprint),
            reviewVersion=VERSION, displayHeightRangeSourceZ=region['displayHeightRange'])
item['regions'] = [dict(id=region['id'], points=len(selected), addedAreaM2=footprint.area,
                        roofOnly=True, planeSupported=True, mode='user-redline-outline',
                        displayActualSurface=True, reviewPixels=region['pixels'])]
assert [p for p in audit['parcels'] if p['handle'] != '46F'] == [p for p in audit_before['parcels'] if p['handle'] != '46F']
write(audit_path, audit)

def pixels(coords):
    return [((x - x0) / (x1 - x0) * w, (y1 - y) / (y1 - y0) * h) for x, y in coords]

image = Image.open(args.work / '46F-model.png').convert('RGBA')
layer = Image.new('RGBA', image.size)
draw = ImageDraw.Draw(layer)
draw.polygon(pixels(footprint.exterior.coords), fill=(40, 240, 110, 140))
draw.line(pixels(land.exterior.coords), fill='yellow', width=3)
review = Image.alpha_composite(image, layer).convert('RGB')
for base in [public, published]:
    review.save(base / parcel['info']['reviewImageUrl'])

# 對照圖使用同一份來源點雲，顯示原輪廓及本次使用者紅線修正。
crop = (195, 225, 240, 251)
scale = 20
font = ImageFont.truetype(str(ROOT / 'NotoSansTC-Bold.otf'), 22)
panels = []
for title, geometry in [('修正前：原始已判讀投影', old_footprint), ('修正後：依使用者紅線收邊', footprint)]:
    panel = image.crop(crop).resize(((crop[2] - crop[0]) * scale, (crop[3] - crop[1]) * scale)).convert('RGBA')
    overlay = Image.new('RGBA', panel.size)
    d = ImageDraw.Draw(overlay)
    coords = [((x - crop[0]) * scale, (y - crop[1]) * scale) for x, y in pixels(geometry.exterior.coords)]
    d.polygon(coords, fill=(40, 240, 110, 90))
    d.line(coords, fill=(80, 255, 150, 255), width=3)
    if geometry is footprint:
        d.line([((x - crop[0]) * scale, (y - crop[1]) * scale) for x, y in pixels(old_footprint.exterior.coords)], fill=(240, 70, 220, 230), width=2)
    panel = Image.alpha_composite(panel, overlay)
    result = Image.new('RGB', (panel.width, panel.height + 55), '#172329')
    result.paste(panel, (0, 55))
    ImageDraw.Draw(result).text((16, 12), title, font=font, fill='white')
    panels.append(result)
comparison = Image.new('RGB', (panels[0].width * 2, panels[0].height), '#172329')
for i, panel in enumerate(panels):
    comparison.paste(panel, (i * panel.width, 0))
comparison.save(args.work / '804-5-before-after-v8.png')

report = dict(version=VERSION, parcel=KEY, status='待複核', source='既有彩色 LAS 點雲及使用者紅線',
              previousAreaM2=old_footprint.area, occupiedAreaM2=footprint.area,
              removedAreaM2=old_footprint.area - footprint.area, occupancyPercent=footprint.area / registered * 100,
              registeredAreaM2=registered, supportedPointCount=len(selected), reviewPixels=region['pixels'],
              displayHeightRangeSourceZ=region['displayHeightRange'], displayActualSurface=True,
              unchangedOtherParcels=True, unchangedCadGeometry=True, noExpansion=True,
              sourceDxfSha256=audit['sourceDxfSha256'], published=False)
write(OUT / '804-5-redline-review-20261019.json', report)

assert (public / relative).read_bytes() == (published / relative).read_bytes()
assert shape(feature['geometry']).is_valid
assert abs(transform(inverse, shape(feature['geometry'])).area - footprint.area) < 1e-6
assert sum(f['properties'].get('projectedAreaM2', 0) for f in fc['features']) == footprint.area
assert region['displayHeightRange'][0] > item['groundHeight'] + .5
assert 'displayActualSurface' in bundle
print(json.dumps(report, ensure_ascii=False, indent=2))

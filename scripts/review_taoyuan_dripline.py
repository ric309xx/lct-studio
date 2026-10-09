"""Local, reversible dripline review; preserve the original raster result."""
import copy
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.codex-tmp/geospatial-py'))
from pyproj import Transformer
from shapely.geometry import Polygon, shape, mapping
from shapely.ops import transform, unary_union

source = ROOT / 'analysis/20261008-taoyuan-cadastral-test/dripline-review/original-overlay.geojson'
output = ROOT / 'analysis/20261008-taoyuan-cadastral-test/dripline-review'
data = json.loads(source.read_text(encoding='utf-8'))
review = copy.deepcopy(data)
building = next(f for f in review['features'] if f['properties']['kind'] == 'occupancy-building')
ring = building['geometry']['coordinates'][0]
# The southeast appendage is not a roof edge. Bridge its two existing main
# roof-edge anchors. This is a local visual interpretation, not a new survey.
assert ring[14] == [121.217056936, 24.961762503]
assert ring[24] == [121.21706685, 24.961767905]
trimmed = ring[:15] + ring[24:]
forward = Transformer.from_crs('EPSG:4326', 'EPSG:3826', always_xy=True).transform
inverse = Transformer.from_crs('EPSG:3826', 'EPSG:4326', always_xy=True).transform
original = transform(forward, Polygon(ring))
candidate = transform(forward, Polygon(trimmed))
parcel = unary_union([transform(forward, shape(f['geometry'])) for f in data['features']
                      if f['properties']['kind'] == 'cadastral-fill'])
assert original.is_valid and candidate.is_valid and parcel.is_valid
corrected = candidate.intersection(parcel)
assert corrected.geom_type == 'Polygon' and corrected.is_valid
assert corrected.area > 0 and corrected.difference(parcel).area < 1e-6
assert corrected.difference(original).area < 1e-6
area = round(corrected.area, 2)
percent = round(corrected.area / 500 * 100, 2)
metrics = {
    'cadastralAreaM2': 500,
    'occupiedAreaM2': area,
    'occupancyPercent': percent,
    'areaMethod': 'EPSG:3826 vector dripline polygon intersected with the complete parcel',
    'reviewStatus': 'local roof-edge interpretation; inspect the southeast corner in 3D',
    'originalRasterAreaM2': 36.67,
    'originalVectorAreaM2': original.area,
    'trimmedVectorAreaM2BeforeParcelClip': candidate.area,
    'removedVectorAreaM2': original.area - corrected.area,
    'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'excludedOriginalVertexIndices': list(range(15, 24)),
    'replacementEdgeWgs84': [ring[14], ring[24]],
    'note': '滴水線垂直投影；右端非屋頂尖角已排除，並與完整地號相交。改以 TWD97 向量輪廓重算，舊格網 36.67 m² 留存供比對。',
}
building['geometry'] = mapping(transform(inverse, corrected))
for feature in review['features']:
    feature['properties'].update({k: metrics[k] for k in ['cadastralAreaM2','occupiedAreaM2','occupancyPercent','areaMethod','reviewStatus']})
output.mkdir(parents=True, exist_ok=True)
(output / 'taoyuan-building-overlay.geojson').write_text(json.dumps(review, ensure_ascii=False, indent=2), encoding='utf-8')
(output / 'metrics.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(metrics, ensure_ascii=True, indent=2))

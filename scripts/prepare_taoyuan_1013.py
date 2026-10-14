"""由原始 DXF 與人工核對截圖建立三區七地號；不推定占用面積。"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--packages', type=Path)
args = parser.parse_args()
if args.packages:
    sys.path.insert(0, str(args.packages))
import ezdxf
import rasterio
from shapely.geometry import Polygon, Point, mapping
from shapely.ops import transform, unary_union
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'analysis/20261014-taoyuan-1013'
inputs = json.loads((OUT / 'parcel-inputs.json').read_text(encoding='utf-8'))
source = Path(inputs['sourceDxf'])
entities = {e.dxf.handle: e for e in ezdxf.readfile(source).modelspace()}
assert len(entities) == 7
forward = Transformer.from_crs(3826, 4326, always_xy=True).transform
inverse = Transformer.from_crs(4326, 3826, always_xy=True).transform
catalog, audit, groups = [], [], {}

def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

with rasterio.open(inputs['sourceDem']) as dem:
    assert '3826' in dem.crs.to_wkt()
    for item in inputs['parcels']:
        entity = entities[item['dxfHandle']]
        assert entity.dxftype() == 'POLYLINE' and entity.is_closed
        polygon = Polygon([(v.dxf.location.x, v.dxf.location.y) for v in entity.vertices])
        assert polygon.is_valid and polygon.area > 0
        assert polygon.contains(Point(item['referencePointTwd97'])), item['parcelNo']
        assert abs(polygon.area-item['registeredAreaM2']) < 0.05
        anchor = polygon.representative_point()
        longitude, latitude = forward(anchor.x, anchor.y)
        assert math.dist(inverse(longitude, latitude), (anchor.x, anchor.y)) < 0.001
        ground = float(next(dem.sample([(anchor.x, anchor.y)]))[0])
        assert math.isfinite(ground) and ground != dem.nodata
        group = item['group']
        key = 'shuangling-' + item['parcelNo']
        group_key = 'shuangling-1013-' + group
        fill_id = 'parcel-1013-' + item['parcelNo'] + '-fill'
        properties = {'kind':'cadastral-fill','parcelKey':key,'parcelNo':item['parcelNo'],
                      'sectionName':'雙嶺段','groupKey':group_key,'sourceCrs':'EPSG:3826',
                      'dxfHandle':item['dxfHandle'],'cadastralAreaM2':item['registeredAreaM2'],
                      'geometryAreaM2':round(polygon.area,3),'analysisStatus':'awaiting-building-confirmation'}
        geo = transform(forward, polygon)
        pair = [
            {'type':'Feature','id':fill_id,'properties':properties,'geometry':mapping(geo)},
            {'type':'Feature','id':fill_id.replace('-fill','-boundary'),
             'properties':{**properties,'kind':'cadastral-boundary'},
             'geometry':{'type':'LineString','coordinates':list(geo.exterior.coords)}}
        ]
        groups.setdefault(group, {'features':[], 'polygons':[]})['features'].extend(pair)
        groups[group]['polygons'].append(polygon)
        info = {**inputs['sectionMetadata'], **{k:item[k] for k in ['parcelNo','registrationDate','announcedLandValue','rightsCategory']},
                'cadastralAreaM2':item['registeredAreaM2'],'geometryAreaM2':round(polygon.area,3),
                'analysisStatus':'awaiting-building-confirmation',
                'analysisNote':'地籍依提供 DXF 與查詢截圖匯入；占用範圍待圈選確認，尚未計算面積與比例。'}
        extent = max(polygon.bounds[2]-polygon.bounds[0], polygon.bounds[3]-polygon.bounds[1])
        catalog.append({'key':key,'label':'雙嶺段 '+item['parcelNo']+' 地號','groupKey':group_key,
                        'groupLabel':'雙嶺段｜區塊 '+group,'fillEntityId':fill_id,'info':info,
                        'overlayUrl':'overlays/taoyuan-1013/block-'+group+'.geojson',
                        'tilesetPath':'1013/tileset.json',
                        'focus':{'longitude':longitude,'latitude':latitude,'height':ground+max(100,extent*1.8),
                                 'headingDegrees':0,'pitchDegrees':-65,'rollDegrees':0}})
        audit.append({'parcelNo':item['parcelNo'],'group':group,'dxfHandle':item['dxfHandle'],
                      'referencePointInside':True,'geometryAreaM2':round(polygon.area,3),
                      'registeredAreaM2':item['registeredAreaM2'],'anchorTwd97':[anchor.x,anchor.y],
                      'demOrthometricHeight':ground,'occupancyComputed':False})
for group, data in groups.items():
    collection = {'type':'FeatureCollection','features':data['features']}
    for base in [ROOT/'viewer-source/public', ROOT/'3d-viewer']:
        write_json(base/('overlays/taoyuan-1013/block-'+group+'.geojson'), collection)
    union = unary_union(data['polygons'])
    assert abs(union.area-sum(p.area for p in data['polygons'])) < 0.01
write_json(ROOT/'viewer-source/src/taoyuan1013Parcels.json', catalog)
write_json(OUT/'import-audit.json', {'sourceDxf':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
                                  'sourceCrs':'EPSG:3826','parcelCount':len(catalog),'blockCount':len(groups),'parcels':audit})
print(json.dumps(audit,ensure_ascii=False,indent=2))

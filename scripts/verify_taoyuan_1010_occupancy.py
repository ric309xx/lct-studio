"""Read-only geometry and source/publish parity checks for the 1010 draft."""
import argparse,json,sys,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--packages',required=True);a=p.parse_args();sys.path.insert(0,a.packages)
import ezdxf
from shapely.geometry import shape,Polygon
from shapely import make_valid
from shapely.ops import transform,unary_union
from pyproj import Transformer
root=Path(__file__).resolve().parents[1]
back=Transformer.from_crs(4326,3826,always_xy=True).transform
catalog=json.loads((root/'viewer-source/src/taoyuan1010Parcels.json').read_text(encoding='utf8'))
audit=json.loads((root/'analysis/20261019-taoyuan-1010/occupancy-audit.json').read_text(encoding='utf8'))
config=json.loads((root/'analysis/20261019-taoyuan-1010/cadastral-mapping.json').read_text(encoding='utf8'))
dxf=Path(config['sourceDxf']);assert hashlib.sha256(dxf.read_bytes()).hexdigest()==audit['sourceDxfSha256']
doc=ezdxf.readfile(dxf)

def projected(feature):
 wgs=shape(feature['geometry']);assert wgs.is_valid
 raw=transform(back,wgs)
 # Nanometre coincident vertices can cross after the CRS round trip. Repair
 # topology for comparison only, requiring no material area change.
 q=make_valid(raw)
 assert abs(q.area-raw.area)<1e-7
 return q

checked=set();result=[]
for item,record in zip(catalog,audit['parcels']):
 no=item['info']['parcelNo'];assert no==record['parcelNo']
 url=item['overlayUrl'];source=root/'viewer-source/public'/url;published=root/'3d-viewer'/url
 assert source.read_bytes()==published.read_bytes()
 geo=json.loads(source.read_text(encoding='utf8'))
 checked.add(url)
 own=[f for f in geo['features'] if f['properties']['parcelKey']==item['key']]
 land=unary_union([projected(f) for f in own if f['properties']['kind']=='cadastral-fill'])
 original=unary_union([Polygon([(v.dxf.location.x,v.dxf.location.y) for v in doc.entitydb[h].vertices]) for h in config['parcelHandles'][no]])
 assert land.symmetric_difference(original).area<1e-5,('original DXF boundary changed',no)
 measured=[f for f in own if f['properties']['kind']=='occupancy-building']
 polygons=[projected(f) for f in measured]
 for q in polygons:
  assert q.is_valid and q.difference(land).area<1e-6
 union=unary_union(polygons)
 assert abs(union.area-sum(q.area for q in polygons))<1e-5,'duplicate measured XY'
 assert abs(union.area-record['occupiedAreaM2'])<1e-4
 assert abs(union.area-item['info']['occupiedAreaM2'])<1e-4
 assert abs(land.area-item['info']['geometryAreaM2'])<1e-4
 for feature in own:
  if feature['properties']['kind']=='occupancy-display':
   q=projected(feature)
   assert q.is_valid and q.difference(land).area<1e-6
   assert feature['properties']['projectedAreaM2']==0
 image=item['info']['reviewImageUrl']
 assert (root/'viewer-source/public'/image).read_bytes()==(root/'3d-viewer'/image).read_bytes()
 result.append(dict(parcelNo=no,occupiedAreaM2=union.area,components=len(polygons)))
print(json.dumps(dict(valid=True,unchangedCadastralGroups=len(checked),parcels=result),ensure_ascii=False,indent=2))

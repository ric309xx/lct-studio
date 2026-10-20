"""Display-only road profile for long 17-1; keep every CAD XY and area intact."""
import argparse,json,sys,math,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--packages',required=True);p.add_argument('--work',type=Path,required=True);a=p.parse_args();sys.path.insert(0,a.packages)
import numpy as np,ezdxf
from shapely.geometry import Polygon,box
from shapely.ops import unary_union
from shapely import contains_xy
from pyproj import Transformer
root=Path(__file__).resolve().parents[1]
config=json.loads((root/'analysis/20261019-taoyuan-1010/cadastral-mapping.json').read_text(encoding='utf8'))
doc=ezdxf.readfile(config['sourceDxf']);polygons=[Polygon([(v.dxf.location.x,v.dxf.location.y) for v in doc.entitydb[h].vertices]) for h in config['parcelHandles']['17-1']]
land=unary_union(polygons);parts=sorted(list(land.geoms) if land.geom_type=='MultiPolygon' else [land],key=lambda q:q.area,reverse=True)
xyz=np.load(a.work/'cl1-points.npz')['xyz'][::5];points=xyz[contains_xy(land,xyz[:,0],xyz[:,1])]
minx,miny,maxx,maxy=land.bounds;stations=np.arange(math.floor(miny/2)*2,math.ceil(maxy/2)*2+.1,2)
raw=[];counts=[]
for y in stations:
 q=points[np.abs(points[:,1]-y)<=4,2];assert len(q)>20
 raw.append(float(np.quantile(q,.18)));counts.append(len(q))
heights=np.array([np.median(raw[max(0,i-1):min(len(raw),i+2)]) for i in range(len(raw))])
fwd=Transformer.from_crs(3826,4326,always_xy=True).transform
def position(x,y):
 lon,lat=fwd(x,y);return [round(lon,10),round(lat,10),round(float(np.interp(y,stations,heights)),3)]
components=[];display_area=0
for index,poly in enumerate(parts):
 pieces=[]
 for y in stations[:-1]:
  g=poly.intersection(box(minx-1,y,maxx+1,y+2))
  for q in ([g] if g.geom_type=='Polygon' else getattr(g,'geoms',[])):
   if q.geom_type!='Polygon' or q.area<1e-8:continue
   assert not q.interiors
   pieces.append([position(x,y) for x,y in list(q.exterior.coords)[:-1]]);display_area+=q.area
 boundary=[]
 for start,end in zip(list(poly.exterior.coords)[:-1],list(poly.exterior.coords)[1:]):
  steps=max(1,math.ceil(math.dist(start,end)/2))
  boundary.extend(position(start[0]+(end[0]-start[0])*i/steps,start[1]+(end[1]-start[1])*i/steps) for i in range(steps))
 boundary.append(boundary[0]);components.append(dict(fillEntityId='parcel-1010-17-1-fill'+('' if index==0 else '-'+str(index+1)),pieces=pieces,boundary=boundary))
assert abs(display_area-land.area)<1e-6
probes=[]
for i in range(2,len(stations)-2,5):
 q=points[(np.abs(points[:,1]-stations[i])<2)&(np.abs(points[:,2]-heights[i])<.15)]
 if len(q)<10:continue
 center=np.median(q[:,:2],axis=0);v=q[np.argmin(np.linalg.norm(q[:,:2]-center,axis=1))]
 probes.append([*fwd(v[0],v[1]),float(v[2])])
assert len(probes)>=10
profile=[[round(fwd(land.centroid.x,y)[1],10),round(float(h),3)] for y,h in zip(stations,heights)]
data=dict(parcelKey='sanzuwu-jiushe-17-1',version='20261020-17-road-v1',source='LAS road interior 18th percentile in 8 m windows; 2 m longitudinal slices, display only',sourceCrs='EPSG:3826',sourceVerticalDatum='TWVD2001',displayLiftM=.35,profile=profile,components=components,probes=probes,originalAreaM2=land.area,partitionAreaM2=display_area)
(root/'viewer-source/src/taoyuan17Ground.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
audit=dict(version=data['version'],sourceDxfSha256=hashlib.sha256(Path(config['sourceDxf']).read_bytes()).hexdigest(),displayOnly=True,xyAndAreaUnchanged=True,sourceRoadHeightMin=float(heights.min()),sourceRoadHeightMax=float(heights.max()),heightRangeM=float(np.ptp(heights)),stationCount=len(stations),stationSupportCounts=counts,components=len(components),pieces=sum(len(c['pieces']) for c in components),probes=len(probes),originalAreaM2=land.area,partitionAreaM2=display_area)
(root/'analysis/20261019-taoyuan-1010/17-ground-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(audit,ensure_ascii=False))

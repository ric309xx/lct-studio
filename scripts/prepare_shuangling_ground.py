"""以道路內 DEM 低分位值建立縱向地面剖面；僅改善顯示，不修改地籍 XY 或面積。"""
import argparse, sys, json, math
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--packages',type=Path);a=p.parse_args()
if a.packages:sys.path.insert(0,str(a.packages))
import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.windows import from_bounds
import ezdxf
from shapely.geometry import Polygon,box
from pyproj import Transformer
ROOT=Path(__file__).resolve().parents[1]
inputs=json.loads((ROOT/'analysis/20261014-taoyuan-1013/parcel-inputs.json').read_text(encoding='utf8'))
d=ezdxf.readfile(inputs['sourceDxf']);e=d.entitydb['32F']
poly=Polygon([(v.dxf.location.x,v.dxf.location.y) for v in e.vertices])
forward=Transformer.from_crs(3826,4326,always_xy=True).transform
minx,miny,maxx,maxy=poly.bounds
with rasterio.open(inputs['sourceDem']) as src:
 w=from_bounds(minx-1,miny-1,maxx+1,maxy+1,src.transform).round_offsets().round_lengths()
 z=src.read(1,window=w,masked=True);t=src.window_transform(w)
 valid=(~np.ma.getmaskarray(z)) & geometry_mask([poly.__geo_interface__],z.shape,t,invert=True)
 yy,xx=np.indices(z.shape);ys=t.f+(yy+.5)*t.e;xs=t.c+(xx+.5)*t.a
 stations=np.arange(miny,maxy+2,2.0);heights=[];counts=[]
 for y in stations:
  values=z.data[valid & (np.abs(ys-y)<=4)]
  assert len(values)>5
  heights.append(float(np.quantile(values,.25)));counts.append(len(values))
 # 中值平滑消除單站車輛／路緣擾動；不以屋頂 DSM 直接鋪地籍。
 heights=np.array([np.median(heights[max(0,i-2):min(len(heights),i+3)]) for i in range(len(heights))])
 lats=[forward(poly.centroid.x,y)[1] for y in stations]
 def pos(x,y):
  lon,lat=forward(x,y)
  return [round(lon,10),round(lat,10),round(float(np.interp(y,stations,heights)),3)]
 pieces=[]
 for y in stations[:-1]:
  g=poly.intersection(box(minx-1,y,maxx+1,y+2))
  for part in ([g] if g.geom_type=='Polygon' else getattr(g,'geoms',[])):
   if part.geom_type=='Polygon' and part.area>1e-7:pieces.append([pos(x,y) for x,y in list(part.exterior.coords)[:-1]])
 # 用來源 TWD97 切片面積核對，不以經緯度平方單位計算。
 area=sum(poly.intersection(box(minx-1,y,maxx+1,y+2)).area for y in stations[:-1])
 assert abs(area-poly.area)<.001
 boundary=[]
 for start,end in zip(list(poly.exterior.coords)[:-1],list(poly.exterior.coords)[1:]):
  n=max(1,math.ceil(math.dist(start,end)/2))
  boundary.extend(pos(start[0]+(end[0]-start[0])*i/n,start[1]+(end[1]-start[1])*i/n) for i in range(n))
 boundary.append(boundary[0])
 # 高程偏移只取道路內點比對模型，不把正高直接當橢球高。
 probes=[]
 for y in stations[::5]:
  section=poly.intersection(box(minx-1,y-1,maxx+1,y+1))
  q=section.representative_point();probes.append(pos(q.x,q.y))
 data={'parcelKey':'shuangling-1121','source':'DEM 道路內 8 m 視窗第 25 百分位，2 m 剖面；顯示用地面估計',
       'profile':[[round(lat,10),round(float(h),3)] for lat,h in zip(lats,heights)],'pieces':pieces,'boundary':boundary,'probes':probes}
 (ROOT/'viewer-source/src/shuanglingGround.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
 print(json.dumps({'pieces':len(pieces),'probes':len(probes),'heightMin':float(min(heights)),'heightMax':float(max(heights)),'areaPreservedM2':area},ensure_ascii=False))

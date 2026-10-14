"""按已判讀的模型搜尋區取低棚／屋頂，與 TWD97 地籍裁切；CAD 房屋線不參與面積。"""
import argparse, json, sys, math, hashlib, struct
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--packages',type=Path,required=True)
parser.add_argument('--work',type=Path,required=True)
parser.add_argument('--publish',action='store_true')
args=parser.parse_args();sys.path.insert(0,str(args.packages))
import numpy as np, ezdxf
from shapely.geometry import Polygon, shape, mapping
from shapely import contains_xy
from shapely.ops import unary_union, transform
from rasterio.features import shapes
from affine import Affine
from pyproj import Transformer
from PIL import Image, ImageDraw, ImageFilter
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'analysis/20261014-taoyuan-1013'
inputs=json.loads((OUT/'parcel-inputs.json').read_text(encoding='utf8'))
review=json.loads((OUT/'model-review-regions.json').read_text(encoding='utf8'))
cad=ezdxf.readfile(inputs['sourceDxf'])
lands={p['parcelNo']:Polygon([(v.dxf.location.x,v.dxf.location.y) for v in cad.entitydb[p['dxfHandle']].vertices]) for p in inputs['parcels']}
forward=Transformer.from_crs(3826,4326,always_xy=True)
resolution=.1;results=[]
def polys(g):return [g] if g.geom_type=='Polygon' else [p for p in getattr(g,'geoms',[]) if p.geom_type=='Polygon']
def prepare_cache(name):
 """只讀原始 LAS，保留同一 XY 的低棚與高樹多層點，不先取 DSM 最高面。"""
 cache=args.work/(name+'-points.npz')
 if cache.exists():return cache
 coords=np.array([p for r in review['regions'] if r['cache']==name for p in r['roi']+r['anchors']])
 xmin,ymin=coords.min(axis=0)-2;xmax,ymax=coords.max(axis=0)+2
 xyzs=[];colors=[];sources=[]
 for path in sorted(Path(inputs['sourceDem']).parents[1].joinpath('terra_las_1_4').glob('*.las')):
  with path.open('rb') as stream:header=stream.read(375)
  maxx,minx,maxy,miny=struct.unpack_from('<4d',header,179)
  if maxx<xmin or minx>xmax or maxy<ymin or miny>ymax:continue
  fmt=header[104]&63;length=struct.unpack_from('<H',header,105)[0]
  count=struct.unpack_from('<Q',header,247)[0] or struct.unpack_from('<I',header,107)[0]
  scale=np.array(struct.unpack_from('<3d',header,131));offset=np.array(struct.unpack_from('<3d',header,155))
  rgb_offset={2:20,3:28,5:28,7:30,8:30,10:30}[fmt]
  dtype=np.dtype({'names':['x','y','z','rgb'],'formats':['<i4','<i4','<i4',('<u2',3)],'offsets':[0,4,8,rgb_offset],'itemsize':length})
  pts=np.memmap(path,dtype=dtype,mode='r',offset=struct.unpack_from('<I',header,96)[0],shape=(count,))
  for start in range(0,count,1000000):
   q=pts[start:start+1000000];x=q['x']*scale[0]+offset[0];y=q['y']*scale[1]+offset[1]
   keep=(x>=xmin)&(x<xmax)&(y>ymin)&(y<=ymax)
   if not keep.any():continue
   xyzs.append(np.c_[x[keep],y[keep],q['z'][keep]*scale[2]+offset[2]])
   color=q['rgb'][keep].astype(float)
   if color.max()>255:color/=257
   colors.append(color.astype(np.uint8))
  del pts
  with path.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
  sources.append({'name':path.name,'bytes':path.stat().st_size,'sha256':digest})
 assert xyzs,'搜尋範圍內沒有來源點雲'
 np.savez_compressed(cache,xyz=np.concatenate(xyzs),rgb=np.concatenate(colors),sources=json.dumps(sources))
 return cache
args.work.mkdir(parents=True,exist_ok=True)
for region in review['regions']:
 cache=prepare_cache(region['cache']);data=np.load(cache);xyz=data['xyz'];rgb=data['rgb']
 roi=Polygon(region['roi']);xmin,ymin,xmax,ymax=roi.bounds
 xmin=math.floor(xmin-1);ymax=math.ceil(ymax+1)
 w=math.ceil((xmax+1-xmin)/resolution);h=math.ceil((ymax-ymin+1)/resolution)
 keep=contains_xy(roi,xyz[:,0],xyz[:,1])&(xyz[:,2]>=region['heightRange'][0])&(xyz[:,2]<=region['heightRange'][1])
 p=xyz[keep];ix=((ymax-p[:,1])/resolution).astype(int)*w+((p[:,0]-xmin)/resolution).astype(int)
 z=np.full(w*h,np.nan);photo=np.zeros((w*h,3),np.uint8)
 order=np.lexsort((p[:,2],ix));cells=ix[order];chosen=order[np.r_[cells[1:]!=cells[:-1],True]]
 z[ix[chosen]]=p[chosen,2];photo[ix[chosen]]=rgb[keep][chosen]
 # 僅模型確認的屋頂內補 20 cm 格網縫；保留大面積未觀測處。
 mask=Image.fromarray(np.isfinite(z.reshape(h,w)).astype(np.uint8)*255).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
 parts=[]
 for geom,_ in shapes((np.asarray(mask)>0).astype(np.uint8),mask=np.asarray(mask)>0,transform=Affine(resolution,0,xmin,0,-resolution,ymax)):
  poly=shape(geom).intersection(roi)
  for part in polys(poly):
   if part.area<.3:continue
   holes=[r for r in part.interiors if Polygon(r).area>1]
   parts.append(Polygon(part.exterior,holes).simplify(.06,preserve_topology=True))
 full=unary_union(parts).intersection(roi)
 assert full.is_valid
 anchors=[]
 for x,y in region['anchors']:
  near=xyz[np.hypot(xyz[:,0]-x,xyz[:,1]-y)<.3,2]
  assert len(near)>5,'地面校準點不足'
  lon,lat=forward.transform(x,y);anchors.append([lon,lat,float(np.median(near))])
 # 低棚使用點雲屋頂擬合平面，避免最高樹冠回波把棚頂拉高。
 if region.get('boundedDisplay'):
  a=np.c_[p[:,0]-xmin,p[:,1]-ymax,np.ones(len(p))];coeff=np.linalg.lstsq(a,p[:,2],rcond=None)[0]
  for _ in range(3):
   good=np.abs(a@coeff-p[:,2])<.15;coeff=np.linalg.lstsq(a[good],p[good,2],rcond=None)[0]
 else:coeff=None
 features=[]
 for number in region['targets']:
  clipped=full.intersection(lands[number])
  for n,part in enumerate(polys(clipped)):
   if part.area<.01:continue
   rings=[part.exterior,*part.interiors];samples=[]
   for ring in rings:
    for distance in np.arange(0,ring.length,.4):
     point=ring.interpolate(distance);x,y=point.x,point.y
     if coeff is not None:height=float(np.array([x-xmin,y-ymax,1])@coeff)
     else:
      dist=np.hypot(p[:,0]-x,p[:,1]-y);near=p[dist<.65,2]
      if len(near)<3:near=p[np.argsort(dist)[:20],2]
      height=float(np.quantile(near,.8))
     lon,lat=forward.transform(x,y);samples.append([lon,lat,height])
   features.append({'type':'Feature','id':f'model-{region["id"]}-{number}-{n}', 'properties':{
    'kind':'occupancy-building','parcelKey':'shuangling-'+number,'parcelNo':number,'sourceCrs':'EPSG:3826',
    'analysisStatus':'model-derived','projectedAreaM2':part.area,'displayWallContinuity':True,
    'continuousOccupancy':bool(region.get('boundedDisplay')),'modelRoofSamples':samples,'modelGroundAnchors':anchors,
    'displayNote':'模型屋頂補色；不增加平面面積；遮蔽處待複核'},'geometry':mapping(transform(forward.transform,part))})
 im=Image.fromarray(photo.reshape(h,w,3)).convert('RGBA');layer=Image.new('RGBA',im.size);draw=ImageDraw.Draw(layer)
 def pixel(coords):return [((x-xmin)/resolution,(ymax-y)/resolution) for x,y in coords]
 for part in polys(full):draw.line(pixel(part.exterior.coords),fill='#44ff88',width=2)
 for number in region['targets']:draw.line(pixel(lands[number].exterior.coords),fill='#ffdd33',width=2)
 Image.alpha_composite(im,layer).save(args.work/(region['id']+'-review.png'))
 results.append({'region':region['id'],'interpretation':region['interpretation'],'cacheSha256':hashlib.sha256(cache.read_bytes()).hexdigest(),
   'sourceFiles':json.loads(str(data['sources'])) if 'sources' in data else [],
   'fullFootprintTwd97':mapping(full),'modelRoofPlane':coeff.tolist() if coeff is not None else None,
   'groundAnchors':anchors,'features':features})
 print(region['id'],[(f['properties']['parcelNo'],round(f['properties']['projectedAreaM2'],3)) for f in features],flush=True)
audit={'method':'模型分層彩色點雲語意範圍與 TWD97 地籍交集','crs':'EPSG:3826','resolutionM':resolution,
 'status':'待複核','holeRepairMaxM2':1,'closingPixels':5,'areaNote':'模型初估投影；補色立面不計面積，CAD 房屋線只對照。1121 僅已判讀目標，不代表全段清查。','regions':results}
(args.work/'model-refinement-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf8')
if args.publish:
 catalogPath=ROOT/'viewer-source/src/taoyuan1013Parcels.json';catalog=json.loads(catalogPath.read_text(encoding='utf8'))
 allFeatures=[f for r in results for f in r['features']];targets={'1121','1144','704-1'}
 for parcel in catalog:
  number=parcel['info']['parcelNo']
  if number not in targets:continue
  features=[f for f in allFeatures if f['properties']['parcelNo']==number]
  # 平面聯集避免任何重疊屋頂重複計算。
  inverse=Transformer.from_crs(4326,3826,always_xy=True)
  area=unary_union([transform(inverse.transform,shape(f['geometry'])) for f in features]).area
  parcel['info'].update(analysisStatus='model-derived',occupiedAreaM2=round(area,4),occupancyPercent=round(area/parcel['info']['cadastralAreaM2']*100,5),
    analysisVersion='20261014-model-primary-v2',analysisNote=audit['areaNote'])
 for group in ['01','03']:
  relative=f'overlays/taoyuan-1013/block-{group}.geojson';path=ROOT/'viewer-source/public'/relative;geo=json.loads(path.read_text(encoding='utf8'))
  geo['features']=[f for f in geo['features'] if not(f['properties'].get('kind')=='occupancy-building' and f['properties'].get('parcelNo') in targets)]
  members={p['info']['parcelNo'] for p in catalog if p['overlayUrl']==relative}
  geo['features'] += [f for f in allFeatures if f['properties']['parcelNo'] in members]
  for f in geo['features']:
   if f['properties'].get('kind')=='occupancy-building' and f['properties'].get('parcelNo')=='1153':
    # 1153 保留上一版模型平面結果，只補穩定的屋頂高程皮層。
    c=np.load(args.work/'1153-surface.npz');x0,y1,width,height,res=c['grid'];width=int(width);height=int(height)
    yy,xx=np.indices((height,width));points=np.c_[x0+(xx.ravel()+.5)*res,y1-(yy.ravel()+.5)*res,c['z']]
    poly=transform(inverse.transform,shape(f['geometry']));roof=points[np.isfinite(points[:,2])&contains_xy(poly,points[:,0],points[:,1])]
    roof=roof[roof[:,2]>np.quantile(roof[:,2],.15)]
    samples=[]
    for ring in [poly.exterior,*poly.interiors]:
     for distance in np.arange(0,ring.length,.4):
      pt=ring.interpolate(distance);dist=np.hypot(roof[:,0]-pt.x,roof[:,1]-pt.y);near=roof[dist<.65,2]
      if len(near)<3:near=roof[np.argsort(dist)[:20],2]
      lon,lat=forward.transform(pt.x,pt.y);samples.append([lon,lat,float(np.quantile(near,.8))])
    anchors=[]
    for x,y in [(265531,2761766),(265530,2761764),(265529,2761762)]:
     near=points[(np.hypot(points[:,0]-x,points[:,1]-y)<.3)&np.isfinite(points[:,2]),2]
     assert len(near)>5
     lon,lat=forward.transform(x,y);anchors.append([lon,lat,float(np.median(near))])
    f['properties'].update(displayWallContinuity=True,modelRoofSamples=samples,modelGroundAnchors=anchors)
  for prefix in ['viewer-source/public','3d-viewer']:(ROOT/prefix/relative).write_text(json.dumps(geo,ensure_ascii=False,indent=2),encoding='utf8')
 catalogPath.write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf8')
 (OUT/'model-refinement-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf8')

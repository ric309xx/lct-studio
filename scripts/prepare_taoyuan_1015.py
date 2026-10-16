"""Model-first provisional occupancy; survey lines never define occupied geometry."""
import argparse,json,sys,math,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--packages',type=Path,required=True);p.add_argument('--work',type=Path,required=True);a=p.parse_args()
sys.path.insert(0,str(a.packages))
import numpy as np,ezdxf
from shapely.geometry import Polygon,Point,shape,mapping
from shapely import contains_xy
from shapely.ops import unary_union,transform
from rasterio.features import shapes
from affine import Affine
from pyproj import Transformer
from PIL import Image,ImageDraw,ImageFilter
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'analysis/20261016-taoyuan-1015'
inputs=json.loads((OUT/'parcel-inputs.json').read_text(encoding='utf8'))
regions=json.loads((OUT/'model-regions.json').read_text(encoding='utf8'))['regions']
inventory={r['handle']:r for r in json.loads((a.work/'inventory.json').read_text())}
d=ezdxf.readfile(inputs['sourceDxf']);forward=Transformer.from_crs(3826,4326,always_xy=True).transform
def write(path,data):
 path.parent.mkdir(exist_ok=True,parents=True);path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
def parts(g):return [g] if g.geom_type=='Polygon' else [q for q in getattr(g,'geoms',[]) if q.geom_type=='Polygon']
def roi(r):
 z=inventory[r['image']];x0,y0,x1,y1=z['imageBounds'];w,h=z['imageSize']
 return Polygon([(x0+x/w*(x1-x0),y1-y/h*(y1-y0)) for x,y in r['pixels']])
def roof_plane(points):
 """Fit a supported nonvertical surface; heights are display evidence, not XY area."""
 if len(points)<12:return None
 origin=points[:,:2].mean(axis=0);q=points[::max(1,len(points)//5000),:3]
 xy=q[:,:2]-origin;design=np.c_[xy,np.ones(len(q))];rng=np.random.default_rng(1015);best=None;score=0
 for _ in range(45):
  ids=rng.choice(len(q),3,replace=False)
  try:c=np.linalg.solve(design[ids],q[ids,2])
  except np.linalg.LinAlgError:continue
  if np.hypot(c[0],c[1])>1:continue
  good=np.abs(design@c-q[:,2])<.15
  if good.sum()>score:best=good;score=good.sum()
 if best is None or score<max(12,len(q)*.15):return None
 c=np.linalg.lstsq(design[best],q[best,2],rcond=None)[0]
 return origin,c
def raster_footprint(selected,search,land,closing=3):
 x0,y0,x1,y1=land.buffer(.5).bounds;w=math.ceil((x1-x0)/resolution);h=math.ceil((y1-y0)/resolution)
 mask=np.zeros((h,w),np.uint8)
 if len(selected):
  ix=((selected[:,0]-x0)/resolution).astype(int);iy=((y1-selected[:,1])/resolution).astype(int)
  mask[iy,ix]=255
  mask=np.asarray(Image.fromarray(mask).filter(ImageFilter.MaxFilter(closing)).filter(ImageFilter.MinFilter(closing)))
 footprints=[]
 for geom,_ in shapes((mask>0).astype('uint8'),mask=mask>0,transform=Affine(resolution,0,x0,0,-resolution,y1)):
  for q in parts(shape(geom).intersection(search).intersection(land)):
   if q.area>=.10:footprints.append(q.simplify(.025,preserve_topology=True))
 return unary_union(footprints).intersection(land)
catalog=[];groups={};audit=[];resolution=.1
for item in inputs['parcels']:
 handle=item['dxfHandle'];meta=inventory[handle];e=d.entitydb[handle]
 land=Polygon([(v.dxf.location.x,v.dxf.location.y) for v in e.vertices]);assert land.is_valid and e.is_closed
 assert land.contains(Point(item['referencePointTwd97']))
 points=np.load(a.work/(handle+'-points.npz'))['points'];inside=contains_xy(land,points[:,0],points[:,1])
 ground=float(np.quantile(points[inside,2],.05));low=points[inside & (points[:,2]<ground+.2)]
 anchors=[]
 for point in low[::max(1,len(low)//1000)]:
  if all(math.hypot(point[0]-q[0],point[1]-q[1])>2 for q in anchors):anchors.append(point[:3].tolist())
  if len(anchors)==5:break
 assert len(anchors)>=2
 source_anchors=[[*forward(q[0],q[1]),q[2]] for q in anchors]
 target_regions=[r for r in regions if handle in r['targets']]
 layers=[];region_audit=[];occupied=Polygon();selected_count=0
 # Preserve the already accepted first Dongliao block exactly.
 if handle in ['40F','416']:
  search=unary_union([roi(r) for r in target_regions])
  selected=points[contains_xy(search.intersection(land.buffer(.3)),points[:,0],points[:,1]) & (points[:,2]>ground+1.5)]
  occupied=raster_footprint(selected,search,land)
  layers=[(q,dict(id='accepted-v1',category='建物／鐵皮／T棚'),selected,None) for q in parts(occupied)]
  selected_count=len(selected)
 else:
  for region in target_regions:
   search=roi(region);clipped=search.intersection(land)
   if clipped.area<.005:continue
   low,high=region.get('heightRange',[ground+1.5,math.inf])
   display_search=search.intersection(land.buffer(2))
   selected=points[contains_xy(display_search,points[:,0],points[:,1]) & (points[:,2]>=low) & (points[:,2]<=high)]
   selected_count+=len(selected)
   plane=roof_plane(selected) if region.get('roofOnly') else None
   if len(selected)<5:
    region_audit.append(dict(id=region['id'],status='insufficient-model-support',points=len(selected)));continue
   if region.get('mode')=='outline':
    full=clipped
   else:
    cropped=selected[contains_xy(land.buffer(.3),selected[:,0],selected[:,1])]
    full=raster_footprint(cropped,search,land,5 if region.get('roofOnly') else 3)
   # Each projected XY area is counted once, even when upper roofs cover lower sheds.
   new=unary_union([q for q in parts(full.difference(occupied)) if q.area>=.005])
   for q in parts(new):
    if q.area>=.005:layers.append((q,region,selected,plane))
   occupied=unary_union([occupied,new])
   region_audit.append(dict(id=region['id'],points=len(selected),addedAreaM2=new.area,roofOnly=bool(region.get('roofOnly')),planeSupported=plane is not None,mode=region.get('mode','model-raster')))
 area=occupied.area
 assert occupied.is_valid and area<=land.area+1e-7
 key=item['section']+'-'+item['parcelNo'];group=f"{item['section']}-1015-{item['group']}";fillid=f'parcel-1015-{key}-fill'
 status='interpreted-draft' if area else 'awaiting-building-confirmation'
 props=dict(kind='cadastral-fill',parcelKey=key,parcelNo=item['parcelNo'],sectionName=item['sectionName'],groupKey=group,sourceCrs='EPSG:3826',dxfHandle=handle,cadastralAreaM2=item['registeredAreaM2'],geometryAreaM2=land.area,analysisStatus=status)
 geo=transform(forward,land)
 features=[dict(type='Feature',id=fillid,properties=props,geometry=mapping(geo)),dict(type='Feature',id=fillid.replace('-fill','-boundary'),properties={**props,'kind':'cadastral-boundary'},geometry=dict(type='LineString',coordinates=list(geo.exterior.coords)))]
 for index,(q,region,selected,plane) in enumerate(layers):
  samples=[]
  for ring in [q.exterior,*q.interiors]:
   for distance in np.arange(0,ring.length,.5):
    pt=ring.interpolate(distance);dist=np.hypot(selected[:,0]-pt.x,selected[:,1]-pt.y);near=selected[dist<(1.25 if not region.get('roofOnly') else .35),2]
    if len(near)<3:near=selected[np.argsort(dist)[:15],2]
    height=float(np.r_[pt.x-plane[0][0],pt.y-plane[0][1],1]@plane[1]) if plane is not None else float(np.quantile(near,.95))
    samples.append([*forward(pt.x,pt.y),height])
  properties=dict(kind='occupancy-building',parcelKey=key,parcelNo=item['parcelNo'],analysisStatus=status,category=region['category'],sourceCrs='EPSG:3826',projectedAreaM2=q.area,displayWallContinuity=True,modelRoofSamples=samples,modelGroundAnchors=source_anchors,analysisRegion=region['id'])
  if handle not in ['40F','416']:properties.update(continuousOccupancy=True,displayRoofOnly=bool(region.get('roofOnly')))
  features.append(dict(type='Feature',id=f'occupancy-1015-{key}-{index}',properties=properties,geometry=mapping(transform(forward,q))))
 assert abs(sum(f['properties'].get('projectedAreaM2',0) for f in features)-area)<1e-5
 groups.setdefault(group,[]).extend(features)
 futai=item['section']=='futai'
 info=dict(county='桃園市',landOffice='中壢',sectionName=item['sectionName'],sectionCode='0337' if futai else '0315',sectionExtensionCode='無' if futai else '0',townCode='03',surveyMethod='數值法' if futai else '圖解法',surveyType='地籍圖重測',mapDate='1990-03' if futai else '1988-02',coordinateSystem='TWD67 二度 TM 坐標（原始地籍資訊）',integrationCoordinateSystem='TWD97 二度 TM（EPSG:3826）',crs='TWD97 二度 TM（EPSG:3826）',scale='1:500',digitizedDate='—' if futai else '2003-12',useZone='—',landUseCategory='—',parcelNo=item['parcelNo'],registrationDate=item['registrationDate'],announcedLandValue=item['announcedLandValue'],rightsCategory=item['rightsCategory'],cadastralAreaM2=item['registeredAreaM2'],geometryAreaM2=round(land.area,3),analysisStatus=status,analysisVersion='20261016-layered-review-v2',analysisNote='待複核；按分層模型確認建物、低棚、雨遮與指定突出構造的投影外緣，再與地籍求交集。重疊投影取聯集；東寮區塊三排除擦邊牆面。實測 CAD 僅供參考，非正式占用認定。',reviewImageUrl=f'overlays/taoyuan-1015/review/{key}.png')
 if area:info.update(occupiedAreaM2=round(area,4),occupancyPercent=round(area/item['registeredAreaM2']*100,5))
 else:info['analysisNote']='尚未確認可計量占用範圍，待複核；不代表確認無占用。實測 CAD 僅供參考。'
 anchor=land.representative_point();lon,lat=forward(anchor.x,anchor.y);extent=max(land.bounds[2]-land.bounds[0],land.bounds[3]-land.bounds[1])
 catalog.append(dict(key=key,label=f"{item['sectionName']} {item['parcelNo']} 地號",groupKey=group,groupLabel=f"{item['sectionName']}｜1015 區塊 {item['group']}",fillEntityId=fillid,info=info,overlayUrl=f'overlays/taoyuan-1015/{group}.geojson',tilesetPath=f"1015-cl{item['model']}/tileset.json",focus=dict(longitude=lon,latitude=lat,height=ground+max(100,extent*1.5),headingDegrees=0,pitchDegrees=-65,rollDegrees=0)))
 im=Image.open(a.work/(handle+'-model.png')).convert('RGBA');layer=Image.new('RGBA',im.size);draw=ImageDraw.Draw(layer)
 bx0,by0,bx1,by1=meta['imageBounds'];iw,ih=meta['imageSize']
 def pixels(coords):return [((x-bx0)/(bx1-bx0)*iw,(by1-y)/(by1-by0)*ih) for x,y in coords]
 for q in parts(occupied):
  draw.polygon(pixels(q.exterior.coords),fill=(40,240,110,140))
  for hole in q.interiors:draw.polygon(pixels(hole.coords),fill=(0,0,0,0))
 draw.line(pixels(land.exterior.coords),fill='yellow',width=3)
 review=Image.alpha_composite(im,layer).convert('RGB')
 for base in [ROOT/'viewer-source/public',ROOT/'3d-viewer']:
  dest=base/info['reviewImageUrl'];dest.parent.mkdir(parents=True,exist_ok=True);review.save(dest)
 audit.append(dict(parcelNo=item['parcelNo'],section=item['section'],handle=handle,queryPointInside=True,cadAreaM2=land.area,registeredAreaM2=item['registeredAreaM2'],occupiedAreaM2=area,groundHeight=ground,groundAnchors=anchors,modelPoints=len(points),selectedPoints=selected_count,status=status,regions=region_audit,footprintTwd97=mapping(occupied)))
 print(key,'area',round(area,3),'ground',ground,flush=True)
for group,features in groups.items():
 for base in [ROOT/'viewer-source/public',ROOT/'3d-viewer']:write(base/f'overlays/taoyuan-1015/{group}.geojson',dict(type='FeatureCollection',features=features))
write(ROOT/'viewer-source/src/taoyuan1015Parcels.json',catalog)
write(OUT/'import-analysis-audit.json',dict(sourceDxfSha256=hashlib.sha256(Path(inputs['sourceDxf']).read_bytes()).hexdigest(),sourceCrs='EPSG:3826',version='20261016-layered-review-v2',resolutionM=resolution,defaultMinimumHeightM=1.5,heightRanges='explicit per semantic region',overlapPolicy='union; low roofs first',displayRepairDoesNotChangeArea=True,registrationAreaNotRescaled=True,cadSurveyUsedForArea=False,parcels=audit))

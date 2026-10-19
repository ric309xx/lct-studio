"""Reconstruct reviewed horizontal roof projections from source LAS, not CAD.

Measure union footprints in EPSG:3826. Green display retains roof height layers
separately; their vertical faces and overlaps add no measured area.
"""
import argparse,json,sys,math,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--packages',required=True);p.add_argument('--work',type=Path,required=True);p.add_argument('--preview-only',action='store_true');a=p.parse_args();sys.path.insert(0,a.packages)
import numpy as np,ezdxf
from shapely.geometry import Polygon,Point,LineString,shape,mapping
from shapely.ops import unary_union,transform
from shapely import contains_xy,make_valid
from rasterio.features import shapes
from affine import Affine
from pyproj import Transformer
from PIL import Image,ImageDraw,ImageFilter,ImageFont
root=Path(__file__).resolve().parents[1];out=root/'analysis/20261019-taoyuan-1010'
cfg=json.loads((out/'cadastral-mapping.json').read_text(encoding='utf8'));config=json.loads((out/'model-regions.json').read_text(encoding='utf8'))
inventory={x['id']:x for x in json.loads((a.work/'roof-review-inventory.json').read_text())}
group_inventory={x['group']:x for x in json.loads((a.work/'inventory.json').read_text())}
doc=ezdxf.readfile(cfg['sourceDxf']);fwd=Transformer.from_crs(3826,4326,always_xy=True).transform
lands={n:unary_union([Polygon([(v.dxf.location.x,v.dxf.location.y) for v in doc.entitydb[h].vertices]) for h in cfg['parcelHandles'][n]]) for n in cfg['includedParcelOrder']}
resolution=config['resolutionM']
def parts(g):return [g] if g.geom_type=='Polygon' else [v for v in getattr(g,'geoms',[]) if v.geom_type=='Polygon']
def dump(path,data):path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def roi(r):
 m=inventory[r['image']];x0,y0,x1,y1=m['bounds'];w,h=m['imageSize'];step=m['resolution']
 return Polygon([(x0+x*step,y1-y*step) for x,y in r['pixels']])
def fit_plane(points,tolerance=.12):
 if len(points)<50:return None
 q=points[::max(1,len(points)//7000)];origin=q[:,:2].mean(axis=0);design=np.c_[q[:,:2]-origin,np.ones(len(q))]
 rng=np.random.default_rng(1010);best=None;score=0
 for _ in range(75):
  ids=rng.choice(len(q),3,replace=False)
  try:c=np.linalg.solve(design[ids],q[ids,2])
  except np.linalg.LinAlgError:continue
  if np.hypot(c[0],c[1])>1:continue
  good=np.abs(design@c-q[:,2])<tolerance
  if good.sum()>score:best=good;score=good.sum()
 if best is None or score<max(40,len(q)*.2):return None
 c=np.linalg.lstsq(design[best],q[best,2],rcond=None)[0]
 return origin,c,score/len(q)
def raster(selected,search):
 if len(selected)<10:return Polygon()
 x0,y0,x1,y1=search.bounds;w,h=math.ceil((x1-x0)/resolution)+1,math.ceil((y1-y0)/resolution)+1
 mask=np.zeros((h,w),np.uint8);ix=((selected[:,0]-x0)/resolution).astype(int);iy=((y1-selected[:,1])/resolution).astype(int)
 mask[iy,ix]=255
 # Only a 0.1 m neighbourhood closes sampling cracks; no broad convex hull.
 mask=np.asarray(Image.fromarray(mask).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3)))
 pp=[]
 for geo,_ in shapes((mask>0).astype('uint8'),mask=mask>0,transform=Affine(resolution,0,x0,0,-resolution,y1)):
  for v in parts(shape(geo).intersection(search)):
   if v.area>=.05:pp.append(v.simplify(.015,preserve_topology=True))
 return unary_union(pp)
def export(g):
 result=transform(fwd,g)
 if not result.is_valid:result=unary_union(parts(make_valid(result)))
 assert result.is_valid
 return mapping(result)
layers={n:[] for n in lands};region_audit=[];ground={};group_points={}
for group in ['cl1','cl2-north','cl2-south']:
 data=np.load(a.work/(group+'-points.npz'));xyz=data['xyz'];group_points[group]=xyz
 numbers=group_inventory[group]['numbers'];land=unary_union([lands[n] for n in numbers]);inside=contains_xy(land,xyz[:,0],xyz[:,1]);q=xyz[inside]
 for n in numbers:
  pp=xyz[contains_xy(lands[n],xyz[:,0],xyz[:,1])];ground[n]=float(np.quantile(pp[:,2],.1))
 for r in [r for r in config['regions'] if r['group']==group]:
  search=roi(r);keep=contains_xy(search,xyz[:,0],xyz[:,1]) & (xyz[:,2]>=r['heightRange'][0]) & (xyz[:,2]<=r['heightRange'][1]);selected=xyz[keep]
  plane=fit_plane(selected)
  if r.get('requirePlane'):
   if plane is None:region_audit.append(dict(id=r['id'],status='insufficient-planar-model-support',points=len(selected)));continue
   origin,c,ratio=plane;selected=selected[np.abs(np.c_[selected[:,:2]-origin,np.ones(len(selected))]@c-selected[:,2])<.18]
  footprint=raster(selected,search)
  areas={}
  for no in r['targets']:
   clipped=footprint.intersection(lands[no]);clipped=unary_union([v for v in parts(clipped) if v.area>=.01]);areas[no]=clipped.area
   if clipped.is_empty:continue
   for v in parts(clipped):layers[no].append((v,r,selected,plane))
  region_audit.append(dict(id=r['id'],heightRange=r['heightRange'],modelPoints=len(selected),planeSupport=plane[2] if plane is not None else None,modelFootprintM2=footprint.area,parcelIntersectionsM2=areas,footprintTwd97=mapping(footprint)))
  print(json.dumps({k:v for k,v in region_audit[-1].items() if k!='footprintTwd97'},ensure_ascii=False),flush=True)
audit=[]
for no in cfg['includedParcelOrder']:
 footprint=unary_union([v for v,r,selected,plane in layers[no]])
 assert footprint.is_valid and footprint.difference(lands[no]).area<1e-7
 audit.append(dict(parcelNo=no,occupiedAreaM2=footprint.area,registeredAreaM2=next(p['info']['cadastralAreaM2'] for p in json.loads((root/'viewer-source/src/taoyuan1010Parcels.json').read_text(encoding='utf8')) if p['info']['parcelNo']==no),footprintTwd97=mapping(footprint)))
dump(a.work/'model-occupancy-preview.json',dict(version=config['version'],regions=region_audit,parcels=audit))
# Paint computed projections on source LAS plots for manual acceptance before publishing.
for group,meta in group_inventory.items():
 im=Image.open(a.work/(group+'-top-cad.png')).convert('RGBA');layer=Image.new('RGBA',im.size);draw=ImageDraw.Draw(layer)
 x0,y0,x1,y1=meta['imageBounds'];step=meta['resolution'];pixel=lambda coords:[((x-x0)/step,(y1-y)/step) for x,y in coords]
 for no in meta['numbers']:
  footprint=unary_union([v for v,r,s,p in layers[no]])
  for v in parts(footprint):
   draw.polygon(pixel(v.exterior.coords),fill=(20,245,90,160))
   for hole in v.interiors:draw.polygon(pixel(hole.coords),fill=(0,0,0,0))
 Image.alpha_composite(im,layer).convert('RGB').save(a.work/(group+'-occupancy-preview.jpg'),quality=92)
for p in audit:print(p['parcelNo'],round(p['occupiedAreaM2'],4),flush=True)
if a.preview_only:sys.exit(0)

# Publish only the accepted, supported model projections. Survey polylines do
# not participate in the measured union; keep their identity in the audit.
catalog_path=root/'viewer-source/src/taoyuan1010Parcels.json'
catalog=json.loads(catalog_path.read_text(encoding='utf8'))
features_by_url={}
for item in catalog:
 url=item['overlayUrl']
 if url not in features_by_url:
  old=json.loads((root/'viewer-source/public'/url).read_text(encoding='utf8'))
  features_by_url[url]=[f for f in old['features'] if f['properties']['kind'] in ['cadastral-fill','cadastral-boundary']]

def source_anchors(no,polygon,group):
 points=group_points[group][::5]
 search=polygon.buffer(8).intersection(lands[no]).difference(polygon.buffer(.8))
 q=points[contains_xy(search,points[:,0],points[:,1])]
 assert len(q)>100,(no,'not enough nearby road support')
 level=np.quantile(q[:,2],.15)
 q=q[(q[:,2]>=level)&(q[:,2]<=level+.18)]
 chosen=[]
 # Sample actual low road returns, spatially separated; never use roof Z as
 # an ellipsoid height. Cesium reconciles these anchors against the tile mesh.
 for point in q[::max(1,len(q)//2000)]:
  if all(np.linalg.norm(point[:2]-v[:2])>1.5 for v in chosen):chosen.append(point)
  if len(chosen)==5:break
 assert len(chosen)>=3,(no,'need three independent road anchors')
 return [[*fwd(float(v[0]),float(v[1])),float(v[2])] for v in chosen]

def roof_samples(polygon,selected):
 samples=[]
 for ring in [polygon.exterior,*polygon.interiors]:
  for distance in np.arange(0,ring.length,.5):
   pt=ring.interpolate(distance);dist=np.hypot(selected[:,0]-pt.x,selected[:,1]-pt.y)
   near=selected[dist<.35,2]
   if len(near)<3:near=selected[np.argpartition(dist,min(14,len(dist)-1))[:15],2]
   samples.append([*fwd(pt.x,pt.y),float(np.quantile(near,.75))])
 return samples

font=ImageFont.truetype('C:/Windows/Fonts/msjh.ttc',24)
small=ImageFont.truetype('C:/Windows/Fonts/msjh.ttc',20)
for item,record in zip(catalog,audit):
 no=item['info']['parcelNo'];area=record['occupiedAreaM2'];info=item['info'];registered=info['cadastralAreaM2']
 group=next(g for g,m in group_inventory.items() if no in m['numbers'])
 info.update(analysisStatus='model-derived',analysisVersion=config['version'],occupiedAreaM2=round(area,4),occupancyPercent=round(area/registered*100,5),reviewImageUrl=f'overlays/taoyuan-1010-v1/review/{no}.jpg')
 difference=100*(lands[no].area/registered-1)
 note=f'模型判讀初估／待複核。建物、鐵皮棚與雨遮之水平投影聯集，與所供CAD地籍求交集；排除車輛、樹冠、桿線，立面與重疊層不重複加算。實測CAD僅參考。CAD幾何面積{lands[no].area:.3f} m²，登記{registered} m²，差異{difference:+.2f}%；原始界線未縮放。'
 if area==0:note+=' 本次已判讀物件與所供CAD地籍無可確認的面積交集；初估0不代表全筆已清查或正式無占用認定。'
 if abs(difference)>5:note+=' 本筆CAD與登記面積差異較大，完整性與界線待複核；結果僅限所供CAD範圍。'
 info['analysisNote']=note
 features=features_by_url[item['overlayUrl']]
 for feature in features:
  if feature['properties']['parcelKey']==item['key']:
   feature['properties'].update(analysisStatus='model-derived',analysisVersion=config['version'],occupiedAreaM2=round(area,4),occupancyPercent=round(area/registered*100,5))
 occupied=Polygon();index=0;display_audit=[]
 for polygon,region,selected,plane in layers[no]:
  anchors=source_anchors(no,polygon,group);samples=roof_samples(polygon,selected)
  exclusive=polygon.difference(occupied)
  for q in parts(exclusive):
   if q.area<1e-10:continue
   props=dict(kind='occupancy-building',parcelKey=item['key'],parcelNo=no,analysisStatus='model-derived',analysisVersion=config['version'],sourceCrs='EPSG:3826',projectedAreaM2=q.area,analysisOnly=True,analysisRegion=region['id'],category=region['category'])
   features.append(dict(type='Feature',id=f'occupancy-1010-{no}-{index}',properties=props,geometry=export(q)));index+=1
  occupied=unary_union([occupied,polygon])
  props=dict(kind='occupancy-display',parcelKey=item['key'],parcelNo=no,analysisStatus='model-derived',analysisVersion=config['version'],sourceCrs='EPSG:3826',projectedAreaM2=0,displayOnlyProjectionM2=polygon.area,analysisOnly=False,analysisRegion=region['id'],category=region['category'],continuousOccupancy=True,displayActualSurface=True,displayRoofOnly=True,displayWallContinuity=True,modelRoofSamples=samples,modelGroundAnchors=anchors)
  features.append(dict(type='Feature',id=f'display-1010-{no}-{index}',properties=props,geometry=export(polygon)));index+=1
  display_audit.append(dict(region=region['id'],footprintAreaM2=polygon.area,sourceRoofRange=[min(v[2] for v in samples),max(v[2] for v in samples)],sourceGroundAnchors=anchors))
 assert abs(sum(f['properties'].get('projectedAreaM2',0) for f in features if f['properties']['parcelNo']==no)-area)<1e-6
 full=unary_union([shape(r['footprintTwd97']) for r in region_audit if no in r.get('parcelIntersectionsM2',{})])
 # Numerical edge sensitivity only, not claimed survey/control-point accuracy.
 record.update(occupancyPercent=area/registered*100,cadAreaM2=lands[no].area,cadAreaDifferencePercent=difference,analysisStatus='model-derived',scope='reviewed model objects intersected with supplied CAD, not full-parcel legal clearance',displayLayers=display_audit,edgeSensitivity05mM2=[full.buffer(-.05).intersection(lands[no]).area,full.buffer(.05).intersection(lands[no]).area])

 # Source-colour LAS + original CAD lines + measured green intersection.
 meta=group_inventory[group];im=Image.open(a.work/(group+'-occupancy-preview.jpg')).convert('RGB')
 x0,y0,x1,y1=meta['imageBounds'];step=meta['resolution'];bx0,by0,bx1,by1=lands[no].buffer(3).bounds
 crop=im.crop((max(0,int((bx0-x0)/step)),max(0,int((y1-by1)/step)),min(im.width,int((bx1-x0)/step)+1),min(im.height,int((y1-by0)/step)+1)))
 crop.thumbnail((1500,1900));width=max(1000,crop.width)
 review=Image.new('RGB',(width,crop.height+150),'#15262b');review.paste(crop,(0,150));draw=ImageDraw.Draw(review)
 draw.text((20,10),f'三座屋段舊社小段 {no}｜模型判讀初估／待複核',font=font,fill='white')
 draw.text((20,47),f'已判讀投影約 {area:.2f} m²；約 {area/registered*100:.2f}%（登記 {registered} m²）',font=small,fill='white')
 draw.text((20,80),'綠色：建物／棚架／雨遮交集；黃線：所供地籍；紫線：外業參考',font=small,fill='#55ee99')
 draw.text((20,112),'限所供CAD範圍，非正式占用認定；圖面差異及完整性仍需複核',font=small,fill='#ffda6a')
 for base in ['viewer-source/public','3d-viewer']:
  dest=root/base/info['reviewImageUrl'];dest.parent.mkdir(parents=True,exist_ok=True);review.save(dest,quality=91)

for url,features in features_by_url.items():
 for base in ['viewer-source/public','3d-viewer']:dump(root/base/url,dict(type='FeatureCollection',features=features))
dump(catalog_path,catalog)

def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as stream:
  for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
 return h.hexdigest()

references=[]
for e in doc.modelspace().query('LWPOLYLINE'):
 line=LineString(e.get_points('xy'))
 entry=dict(handle=e.dxf.handle,closed=bool(e.closed),lengthM=line.length,usedAsOccupiedFootprint=False)
 if e.closed:
  pp=Polygon(e.get_points('xy'))
  entry['referenceOnlyIntersectionsM2']={no:pp.intersection(land).area for no,land in lands.items() if pp.intersects(land)}
 references.append(entry)
sources=[]
for group in group_inventory:
 sources.append(dict(group=group,pointCacheSha256=sha(a.work/(group+'-points.npz')),points=group_inventory[group]['points']))
for name in ['20261010CL1','20261010CL2']:
 model=Path(r'D:\DJI\DJITerra\20261006CL')/name/'models/pc/0'
 sources.append(dict(model=name,tilesetSha256=sha(model/'terra_b3dms/tileset.json'),metadataSha256=sha(model/'terra_obj/metadata.xml')))
dump(out/'occupancy-audit.json',dict(version=config['version'],occupancyComputed=True,sourceDxf=cfg['sourceDxf'],sourceDxfSha256=sha(Path(cfg['sourceDxf'])),sourceCrs='EPSG:3826',sourceVerticalDatum='TWVD2001 (EPSG:8904)',sources=sources,resolutionM=resolution,rasterClosingKernel=3,minimumRoofComponentM2=.05,minimumClippedComponentM2=.01,simplificationToleranceM=.015,method='union(model-supported horizontal roof footprints) intersect supplied cadastral geometry',cadSurveyUsedAsOccupiedFootprint=False,registrationAreaNotRescaled=True,modelCadAccuracyValidated=False,edgeSensitivityNote='plus/minus 0.05 m model-outline buffer; numerical sensitivity only, not survey error bounds',exclusions=['cars','motorcycles','trees','poles','wires'],regions=region_audit,surveyReferences=references,parcels=audit))
print('Published six local parcel analyses; production deployment and Git push not performed.',flush=True)

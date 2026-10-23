"""2026-10-24 user review: 239-1 canopy tip and 617-1 downward projection.

239 adds only the explicitly reviewed, model-supported roof tip intersected
with the unchanged cadastral polygon. 617 changes display only, never XY area.
Run after the original 1006/1015 preparation scripts if regenerating assets.
"""
import sys,json,hashlib,copy,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUTER=ROOT.parents[1]
sys.path.insert(0,str(OUTER/'.codex-tmp/geospatial-py'))
import numpy as np
from shapely.geometry import Polygon,shape,mapping
from shapely.ops import transform,unary_union
from pyproj import Transformer
from PIL import Image,ImageDraw,ImageFont

forward=Transformer.from_crs(3826,4326,always_xy=True).transform
inverse=Transformer.from_crs(4326,3826,always_xy=True).transform
review=OUTER/'analysis/20261010-taoyuan-1006/review'
meta=next(p for p in json.loads((review/'manifest.json').read_text())['crops'] if p['parcelNo']=='239-1')
surface=np.load(review/'239-1-surface.npz');z=surface['z'];ground=surface['groundPlane']
cap_pixels=[[205,228],[213,231],[247,251],[244,260],[234,263],[205,244],[199,239]]
to_xy=lambda p:(meta['minX']+p[0]*meta['resolution'],meta['maxY']-p[1]*meta['resolution'])
cap_roi=Polygon([to_xy(p) for p in cap_pixels])
path=Path('overlays/taoyuan-1006/239-1.geojson')
data=json.loads((ROOT/'viewer-source/public'/path).read_text(encoding='utf8'))
original=[f for f in data['features'] if not f['id'].startswith('239-1-reviewed-cap')]
land=transform(inverse,shape(next(f for f in original if f['properties']['kind']=='cadastral-fill')['geometry']))
old_union=unary_union([transform(inverse,shape(f['geometry'])) for f in original if f['properties']['kind']=='occupancy-building'])
full_cap=cap_roi.intersection(land)
added=full_cap.difference(old_union)
assert added.is_valid and added.geom_type in ['Polygon','MultiPolygon'] and .01<added.area<1,(added.geom_type,added.area)
# Fit only the low teal canopy: tree returns are about 8 m above ground;
# this roof is about 3.6 m. The source raster keeps highest returns, so
# excluded cells are not inferred as roof or allowed to lift the display.
yy,xx=np.mgrid[228:245,199:222]
heights=z[yy,xx]-ground[yy,xx]
valid=np.isfinite(heights)&(heights>3.1)&(heights<4.1)
pts=np.c_[meta['minX']+(xx[valid]+.5)*meta['resolution'],meta['maxY']-(yy[valid]+.5)*meta['resolution'],z[yy[valid],xx[valid]]]
origin=pts[:,:2].mean(axis=0);design=np.c_[pts[:,:2]-origin,np.ones(len(pts))]
coef=np.linalg.lstsq(design,pts[:,2],rcond=None)[0]
assert len(pts)>30 and np.quantile(np.abs(design@coef-pts[:,2]),.95)<.18
roof_z=lambda x,y:float(np.r_[x-origin[0],y-origin[1],1]@coef)
samples=[]
for distance in np.arange(0,full_cap.exterior.length,.15):
 p=full_cap.exterior.interpolate(distance);samples.append([*forward(p.x,p.y),roof_z(p.x,p.y)])
anchors=[]
for pixel in [[320,260],[370,300],[420,330],[460,360],[400,280]]:
 x,y=to_xy(pixel);source_z=float(ground[pixel[1],pixel[0]]);anchors.append([*forward(x,y),source_z])
key='sanzuwu-sanzuwu-239-1'
props=dict(kind='occupancy-building',parcelKey=key,parcelNo='239-1',analysisStatus='interpreted-draft',analysisVersion='20261024-user-cap-review',targetId='239-1-reviewed-cap',category='使用者複核之雨遮北端',sourceCrs='EPSG:3826',confidence='user-reviewed',note='依使用者俯視箭頭與側視紅圈補入雨遮端部；排除樹冠與白車。僅新增與地籍相交且未重複計算的水平投影。',projectedAreaM2=added.area,analysisOnly=True,modelRoofSamples=samples,modelGroundAnchors=anchors,continuousOccupancy=True,displayRoofOnly=True,displayActualSurface=True,displayWallContinuity=True,displayMeshHeightRepair=False,displayContinuousRoofSkin=False,displayHeightRangeSourceZ=[130.3,132.5])
analysis=dict(type='Feature',id='239-1-reviewed-cap-analysis',properties=props,geometry=mapping(transform(forward,added)))
display=dict(type='Feature',id='239-1-reviewed-cap-display',properties={**props,'kind':'occupancy-display','analysisOnly':False,'projectedAreaM2':0,'displayOnlyProjectionM2':full_cap.area},geometry=mapping(transform(forward,full_cap)))
data['features']=original+[analysis,display]
new_area=unary_union([old_union,added]).area
assert abs(new_area-old_union.area-added.area)<1e-6 and new_area<=land.area
def write(p,value):
 p.parent.mkdir(exist_ok=True,parents=True);p.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
for base in ['viewer-source/public','3d-viewer']:write(ROOT/base/path,data)
# Keep canonical draft records in sync with the viewer; stable IDs retained.
for name,projected in [('interpreted-footprints.geojson',False),('interpreted-footprints-twd97.geojson',True)]:
 p=ROOT/'analysis/20261010-taoyuan-1006'/name;d=json.loads(p.read_text(encoding='utf8'))
 d['features']=[f for f in d['features'] if not f['id'].startswith('239-1-reviewed-cap')]
 f=copy.deepcopy(analysis)
 if projected:f['geometry']=mapping(added)
 d['features'].append(f);write(p,d)
for p in [ROOT/'analysis/20261010-taoyuan-1006/interpreted-results.json',ROOT/'analysis/20261010-taoyuan-1006/parcel-catalog.json',ROOT/'viewer-source/src/taoyuan1006Parcels.json']:
 if not p.exists():continue
 catalog=json.loads(p.read_text(encoding='utf8'))
 for row in catalog:
  if row.get('parcelNo',row.get('info',{}).get('parcelNo'))!='239-1':continue
  info=row.get('info',row);info.update(occupiedAreaM2=round(new_area,3),occupancyPercent=round(new_area/228*100,4),analysisVersion='20261024-user-cap-review')
  if 'targets' in row:
   row['targets']=[t for t in row['targets'] if t['id']!='239-1-reviewed-cap']+[dict(id='239-1-reviewed-cap',category=props['category'],selectedProjectionAreaM2=round(added.area,6),capPixelRing=cap_pixels,note=props['note'])];row['targetCount']=len(row['targets'])
   row['pending']='北端低雨遮已依2026-10-24使用者紅圈與箭頭補入；樹冠遮蔽區及其他三處屋緣仍待複核。'
  info['analysisNote']=info.get('analysisNote','')+' 2026-10-24 已依紅圈／箭頭補入北端低雨遮，樹木與車輛不計入。' if '2026-10-24' not in info.get('analysisNote','') else info['analysisNote']
 write(p,catalog)
# Analytical north-up source diagram, not a retouched site photograph.
photo=Image.open(review/'239-1-colour.png').convert('RGBA');layer=Image.new('RGBA',photo.size);draw=ImageDraw.Draw(layer)
def px(coords):return [((x-meta['minX'])/meta['resolution'],(meta['maxY']-y)/meta['resolution']) for x,y in coords]
union=unary_union([old_union,added]);polys=[union] if union.geom_type=='Polygon' else list(union.geoms)
for q in polys:
 draw.polygon(px(q.exterior.coords),fill=(40,240,110,140),outline=(30,255,100,255),width=2)
 for hole in q.interiors:draw.polygon(px(hole.coords),fill=(0,0,0,0))
draw.line(px(land.exterior.coords),fill='yellow',width=3)
mapped=Image.alpha_composite(photo,layer).convert('RGB');panel=Image.new('RGB',(mapped.width,mapped.height+90),'#14232a');panel.paste(mapped,(0,90))
draw=ImageDraw.Draw(panel);font=ImageFont.truetype('C:/Windows/Fonts/msjh.ttc',18)
draw.text((12,6),'239-1｜2026-10-24 雨遮端部複核',font=font,fill='white')
draw.text((12,34),f'已判讀投影 {new_area:.3f} m²（新增 {added.area:.3f} m²）｜地籍不變｜待複核',font=font,fill='white')
draw.text((12,62),'綠色：建物／雨遮投影；樹冠、白車及立面面積不列入',font=font,fill='#43ee82')
for base in ['viewer-source/public','3d-viewer']:panel.save(ROOT/base/'overlays/taoyuan-1006/review/239-1-interpreted.png')
# 617-1: retain the accepted geometry and metric, add only the vertical
# projection and ground cap. No adjacent red pitched roof is incorporated.
path617=Path('overlays/taoyuan-1015/dongliao-1015-01.geojson')
d617=json.loads((ROOT/'viewer-source/public'/path617).read_text(encoding='utf8'))
measure617=[{k:f[k] for k in ['id','geometry']}|{'area':f['properties'].get('projectedAreaM2')} for f in d617['features'] if f['properties'].get('kind')=='occupancy-building']
for f in d617['features']:
 p=f['properties']
 if p.get('parcelKey')!='dongliao-617-1' or p.get('kind')!='occupancy-display':continue
 roof=p['modelRoofSamples']
 def nearest_height(point):
  return min(roof,key=lambda r:math.hypot((r[0]-point[0])*math.cos(math.radians(point[1])),r[1]-point[1]))[2]
 p.update(displayGroundProjectionVolume=True,displayGroundProjectionRings=[[[v[0],v[1],nearest_height(v)] for v in ring] for ring in f['geometry']['coordinates']],displayClassifyToGround=True,displayProjectionNote='2026-10-24 使用者要求顯示雨遮下方建物；既有投影向下延伸至地籍地面，僅為示意，不是新增建物量體或面積。')
assert measure617==[{k:f[k] for k in ['id','geometry']}|{'area':f['properties'].get('projectedAreaM2')} for f in d617['features'] if f['properties'].get('kind')=='occupancy-building']
for base in ['viewer-source/public','3d-viewer']:write(ROOT/base/path617,d617)
audit=dict(version='20261024-239-cap-617-projection',cadastreUnchanged=True,added239HorizontalAreaM2=added.area,previous239AreaM2=old_union.area,new239AreaM2=new_area,capPixels=cap_pixels,capRoofSourceZRange=[min(p[2] for p in samples),max(p[2] for p in samples)],roofSupportingCells=len(pts),treeReturnsExcludedAboveGroundM=4.1,capWithinCadastre=True,projection617AreaUnchanged=True,projection617NotBuildingVolume=True,sourceRasterSha256=hashlib.sha256((review/'239-1-surface.npz').read_bytes()).hexdigest())
write(ROOT/'analysis/20261024-display-review/239-617-audit.json',audit)
print(json.dumps(audit,ensure_ascii=False))

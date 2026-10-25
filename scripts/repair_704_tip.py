"""704-1 user-reviewed tip: native LAS roof layers clipped to unchanged cadastre.

Run review_704_tip.py first. No model/cadastral transform is changed. Overlapping
eave/awning XY is counted once; display layers always have zero measured area.
"""
import argparse, json, sys, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; OUTER=ROOT.parents[1]
sys.path.insert(0,str(OUTER/'.codex-tmp/geospatial-py'))
import numpy as np
import ezdxf
from shapely.geometry import Polygon,shape,mapping,box
from shapely.ops import transform,unary_union
from shapely import contains_xy
from rasterio.features import shapes
from affine import Affine
from pyproj import Transformer
from PIL import Image,ImageFilter,ImageDraw
parser=argparse.ArgumentParser();parser.add_argument('--publish',action='store_true');args=parser.parse_args()
WORK=ROOT/'.local/704-tip-review-20261025'
cache=WORK/'native-points.npz';data=np.load(cache);xyz=data['xyz']
relative=Path('overlays/taoyuan-1013-v2/block-03.geojson')
geo=json.loads((ROOT/'viewer-source/public'/relative).read_text(encoding='utf8'))
original=[f for f in geo['features'] if not f['id'].startswith('704-1-tip-')]
inverse=Transformer.from_crs(4326,3826,always_xy=True).transform
forward=Transformer.from_crs(3826,4326,always_xy=True).transform
land=transform(inverse,shape(original[0]['geometry']))
inputs=json.loads((ROOT/'analysis/20261014-taoyuan-1013/parcel-inputs.json').read_text(encoding='utf8'))
cad_path=Path(inputs['sourceDxf'])
if not cad_path.exists():
    # Same source was reorganized under 03_1013; accept only its recorded hash.
    cad_path=Path(r'D:\DATA\WORK\20261006桃園三維地籍\地籍資料\03_1013\1013-1\1013-1.dxf')
import_audit=json.loads((ROOT/'analysis/20261014-taoyuan-1013/import-audit.json').read_text(encoding='utf8'))
cad_hash=hashlib.sha256(cad_path.read_bytes()).hexdigest()
assert cad_hash==import_audit['sourceSha256'],'CAD source has changed; separate boundary review is required'
cad=ezdxf.readfile(cad_path)
cad_land=Polygon([(v.dxf.location.x,v.dxf.location.y) for v in cad.entitydb['328'].vertices])
cad_error=land.hausdorff_distance(cad_land)
assert cad_error<.002,('Source CAD differs from existing overlay',cad_error)
old=unary_union([transform(inverse,shape(f['geometry'])) for f in original if f['properties'].get('kind')=='occupancy-building'])
union=old;features=[];records=[]
# Tight semantic search box surrounds only the user-circled western tip.
# Native roof Z bands exclude the white car (~119 m) and all tree regions.
x0,y1,x1,y0=266084,2761878,266094,2761872
res=.05;w=round((x1-x0)/res);h=round((y1-y0)/res)
roi=box(x0,y0,x1,y1)
anchors=[]
for x,y in [(266095,2761873),(266096,2761872),(266093,2761870)]:
    near=xyz[np.hypot(xyz[:,0]-x,xyz[:,1]-y)<.2,2]
    assert len(near)>10
    anchors.append([*forward(x,y),float(np.quantile(near,.2))])
for name,low,high in [('awning',120.6,121.4),('eave',127.5,128.6)]:
    p=xyz[contains_xy(roi,xyz[:,0],xyz[:,1])&(xyz[:,2]>low)&(xyz[:,2]<high)]
    idx=((y1-p[:,1])/res).astype(int)*w+((p[:,0]-x0)/res).astype(int)
    mask=np.zeros(w*h,np.uint8);mask[idx]=255
    # Close only 10 cm sampling gaps; do not buffer the measured footprint.
    closed=Image.fromarray(mask.reshape(h,w)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    parts=[]
    for geometry,_ in shapes((np.asarray(closed)>0).astype(np.uint8),mask=np.asarray(closed)>0,transform=Affine(res,0,x0,0,-res,y1)):
        part=shape(geometry)
        if part.area>.5:
            holes=[r for r in part.interiors if Polygon(r).area>.1]
            parts.append(Polygon(part.exterior,holes).simplify(.035,preserve_topology=True))
    assert parts,name
    clipped=unary_union(parts).intersection(land)
    components=[clipped] if clipped.geom_type=='Polygon' else list(clipped.geoms)
    components=[p for p in components if p.geom_type=='Polygon' and p.area>.03]
    full=unary_union(components)
    assert full.geom_type in ['Polygon','MultiPolygon'] and .1<full.area<20,(name,full.geom_type,full.area)
    added=full.difference(union)
    assert added.is_valid and added.geom_type in ['Polygon','MultiPolygon']
    samples=[]
    for component in components:
        for distance in np.arange(0,component.exterior.length,.15):
            point=component.exterior.interpolate(distance)
            near=p[np.hypot(p[:,0]-point.x,p[:,1]-point.y)<.25,2]
            assert len(near)>2,(name,point)
            samples.append([*forward(point.x,point.y),float(np.quantile(near,.75))])
    props={'kind':'occupancy-building','parcelKey':'shuangling-704-1','parcelNo':'704-1','sourceCrs':'EPSG:3826',
        'analysisStatus':'model-derived','analysisVersion':'20261025-704-tip-review','category':'尖角下層雨遮' if name=='awning' else '尖角上層屋簷',
        'projectedAreaM2':added.area,'analysisOnly':True,'continuousOccupancy':True,'displayWallContinuity':True,
        'modelRoofSamples':samples,'modelGroundAnchors':anchors,'displayActualSurface':True,'displayRoofOnly':True,
        'displayHeightRangeSourceZ':[low-.2,high+.15],'displayContinuousRoofSkin':False,'displayMeshHeightRepair':False,
        'note':'依使用者圈選尖角，按來源點雲分層取雨遮／屋簷，與原地籍求交；重疊水平投影只計一次，待複核。'}
    features.append({'type':'Feature','id':f'704-1-tip-{name}-analysis','properties':props,'geometry':mapping(transform(forward,added))})
    # Explicitly requested vertical projection to the same displayed cadastral
    # surface. Keep the exact roof XY; this is a diagram, not measured volume.
    assert full.geom_type=='Polygon','Projection rings require one roof component'
    projection_rings=[]
    for ring in [full.exterior,*full.interiors]:
        projection_ring=[]
        for x,y in ring.coords:
            near=p[np.hypot(p[:,0]-x,p[:,1]-y)<.25,2]
            assert len(near)>2
            projection_ring.append([*forward(x,y),float(np.quantile(near,.75))])
        projection_rings.append(projection_ring)
    features.append({'type':'Feature','id':f'704-1-tip-{name}-display','properties':{
        **props,'kind':'occupancy-display','analysisOnly':False,'projectedAreaM2':0,'displayOnlyProjectionM2':full.area,
        'displayGroundProjectionVolume':True,'displayGroundProjectionRings':projection_rings,'displayClassifyToGround':True,
        'projectionNote':'依使用者要求，原屋頂交集輪廓垂直向下至地籍地表，以半透明綠色顯示；僅展示投影，非實測建物體積，不增加占用面積。'
    },'geometry':mapping(transform(forward,full))})
    records.append({'roof':name,'sourceZBand':[low,high],'supportingPoints':len(p),'intersectionAreaM2':full.area,'uniqueAddedAreaM2':added.area,'footprintTwd97':mapping(full)})
    union=union.union(full)
    print(name,'full',full.area,'unique',added.area,flush=True)
    preview=Image.fromarray(np.repeat(np.asarray(closed)[:,:,None],3,axis=2));draw=ImageDraw.Draw(preview)
    pix=lambda coords:[((x-x0)/res,(y1-y)/res) for x,y in coords]
    draw.line(pix(land.exterior.coords),fill='yellow',width=2)
    for component in components:draw.line(pix(component.exterior.coords),fill='#22ff77',width=2)
    preview.resize((800,480)).save(WORK/f'704-{name}-mask.png')
audit={'version':'20261025-704-tip-review','status':'模型判讀／待複核','sourceCrs':'EPSG:3826','sourceHeightDatum':'TWVD2001',
    'cadastreUnchanged':True,'modelUnchanged':True,'oldAreaM2':old.area,'addedUnionAreaM2':union.area-old.area,'newUnionAreaM2':union.area,
    'registeredAreaM2':1028.72,'displayLayersExcludedFromArea':True,'overlapCountedOnce':True,'resolutionM':res,
    'verticalProjectionRequested':True,'verticalProjectionIsMeasuredVolume':False,'projectionAreaUnchanged':True,
    'semanticRoiTwd97':[x0,y0,x1,y1],'samplingGapClosingRadiusM':.1,'filledHoleMaxM2':.1,'smallComponentThresholdM2':.03,
    'sourceDxf':str(cad_path),'recordedOriginalSourceDxf':inputs['sourceDxf'],'sourceDxfSha256':cad_hash,'cadOverlayHausdorffErrorM':cad_error,
    'nativeCacheSha256':hashlib.sha256(cache.read_bytes()).hexdigest(),'sources':json.loads(str(data['sources'])),
    'regions':records}
(WORK/'tip-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf8')
if args.publish:
    geo['features']=original+features
    for base in ['viewer-source/public','3d-viewer']:(ROOT/base/relative).write_text(json.dumps(geo,ensure_ascii=False,indent=2),encoding='utf8')
    catpath=ROOT/'viewer-source/src/taoyuan1013Parcels.json';catalog=json.loads(catpath.read_text(encoding='utf8'))
    parcel=next(p for p in catalog if p['key']=='shuangling-704-1')
    parcel['info'].update(occupiedAreaM2=round(union.area,4),occupancyPercent=round(union.area/1028.72*100,5),analysisVersion=audit['version'],
        analysisNote='保留原樹下低棚，另依使用者圈選補入尖角雨遮及屋簷與原 TWD97 地籍交集；分層顯示、水平重疊只計一次，模型初估待複核，非全筆清查或實地鑑界。')
    catpath.write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf8')
    out=ROOT/'analysis/20261025-704-tip-review';out.mkdir(exist_ok=True)
    (out/'tip-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'old':old.area,'new':union.area,'added':union.area-old.area,'published':args.publish}),flush=True)

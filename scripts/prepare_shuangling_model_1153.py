"""1153 模型判讀輔助：彩色點雲俯視、高程候選與 TWD97 地籍交集。"""
import argparse, hashlib, json, math, struct, sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--packages', type=Path, required=True)
parser.add_argument('--work', type=Path, required=True)
parser.add_argument('--publish-candidate', type=int, help='俯視及三維複核後指定要發布的候選編號')
args = parser.parse_args()
sys.path.insert(0, str(args.packages))
import numpy as np
import ezdxf
import rasterio
from rasterio.features import shapes
from affine import Affine
from shapely.geometry import Polygon, shape, mapping
from shapely.ops import transform
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
inputs = json.loads((ROOT/'analysis/20261014-taoyuan-1013/parcel-inputs.json').read_text(encoding='utf8'))
entity = ezdxf.readfile(inputs['sourceDxf']).entitydb['395']
land = Polygon([(v.dxf.location.x, v.dxf.location.y) for v in entity.vertices])
resolution = .05
x0 = math.floor(land.bounds[0]-10); y1 = math.ceil(land.bounds[3]+10)
w = math.ceil((land.bounds[2]+10-x0)/resolution); h = math.ceil((y1-land.bounds[1]+10)/resolution)
args.work.mkdir(parents=True, exist_ok=True)
cache = args.work/'1153-surface.npz'
sources = []
if cache.exists():
    cached = np.load(cache)
    assert tuple(cached['grid']) == (x0, y1, w, h, resolution)
    z = cached['z']; rgb = cached['rgb']; sources = json.loads(str(cached['sources']))
else:
    z = np.full(w*h, -np.inf, np.float32); rgb = np.zeros((w*h,3), np.uint8)
    for path in sorted(Path(inputs['sourceDem']).parents[1].joinpath('terra_las_1_4').glob('*.las')):
        with path.open('rb') as f: header = f.read(375)
        maxx,minx,maxy,miny = struct.unpack_from('<4d',header,179)
        if maxx<x0 or minx>x0+w*resolution or maxy<y1-h*resolution or miny>y1: continue
        fmt=header[104]&63; length=struct.unpack_from('<H',header,105)[0]
        count=struct.unpack_from('<Q',header,247)[0] or struct.unpack_from('<I',header,107)[0]
        scale=np.array(struct.unpack_from('<3d',header,131)); offset=np.array(struct.unpack_from('<3d',header,155))
        rgb_offset={2:20,3:28,5:28,7:30,8:30,10:30}[fmt]
        dtype=np.dtype({'names':['x','y','z','rgb'],'formats':['<i4','<i4','<i4',('<u2',3)],'offsets':[0,4,8,rgb_offset],'itemsize':length})
        points=np.memmap(path,dtype=dtype,mode='r',offset=struct.unpack_from('<I',header,96)[0],shape=(count,))
        sources.append({'name':path.name,'bytes':path.stat().st_size,'points':count})
        for start in range(0,count,1000000):
            q=points[start:start+1000000]; x=q['x']*scale[0]+offset[0]; y=q['y']*scale[1]+offset[1]
            ids=np.flatnonzero((x>=x0)&(x<x0+w*resolution)&(y>y1-h*resolution)&(y<=y1))
            if not len(ids): continue
            heights=q['z'][ids]*scale[2]+offset[2]
            idx=np.floor((y1-y[ids])/resolution).astype(int)*w+np.floor((x[ids]-x0)/resolution).astype(int)
            order=np.lexsort((heights,idx)); cells=idx[order]
            chosen=order[np.r_[cells[1:]!=cells[:-1],True]]
            chosen=chosen[heights[chosen]>z[idx[chosen]]]; cells=idx[chosen]
            z[cells]=heights[chosen]; color=q['rgb'][ids[chosen]].astype(float)
            if color.size and color.max()>255: color/=257
            rgb[cells]=np.clip(color,0,255).astype(np.uint8)
        del points
        print(path.name, flush=True)
    np.savez_compressed(cache,z=z,rgb=rgb,grid=[x0,y1,w,h,resolution],sources=json.dumps(sources))

# 用既有道路 DEM 剖面判斷高出地面候選；高度不參與平面面積。
from pyproj import Transformer
forward=Transformer.from_crs(3826,4326,always_xy=True)
profile=json.loads((ROOT/'viewer-source/src/shuanglingGround.json').read_text(encoding='utf8'))['profile']
yy,xx=np.indices((h,w)); xs=x0+(xx+.5)*resolution; ys=y1-(yy+.5)*resolution
_,lat=forward.transform(xs,ys)
ground=np.interp(lat,np.array(profile)[:,0],np.array(profile)[:,1])
height=z.reshape(h,w)-ground
candidate=np.isfinite(height)&(height>2.2)
# 僅填點雲取樣造成的 5–10 cm 小縫；範圍需俯視及 3D 人工檢查。
closed=Image.fromarray(candidate.astype(np.uint8)*255).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
candidate=np.asarray(closed)>0
aff=Affine(resolution,0,x0,0,-resolution,y1)
parts=[]
for geom,_ in shapes(candidate.astype(np.uint8),mask=candidate,transform=aff):
    full=shape(geom); inside=full.intersection(land)
    if inside.area>.01: parts.append((full,inside))
parts.sort(key=lambda pair:pair[1].area,reverse=True)
photo=Image.fromarray(rgb.reshape(h,w,3))
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',18)
def xy(coords): return [((x-x0)/resolution,(y1-y)/resolution) for x,y in coords]
def render(name, overlays=False):
    image=photo.convert('RGBA'); layer=Image.new('RGBA',image.size); draw=ImageDraw.Draw(layer)
    if overlays:
        for i,(_,inside) in enumerate(parts):
            for p in ([inside] if inside.geom_type=='Polygon' else inside.geoms):
                if p.geom_type!='Polygon': continue
                draw.polygon(xy(p.exterior.coords),fill=(40,240,110,130))
                for hole in p.interiors: draw.polygon(xy(hole.coords),fill=(0,0,0,0))
            anchor=inside.representative_point(); draw.text(xy([(anchor.x,anchor.y)])[0],str(i+1),font=font,fill='white',stroke_width=2,stroke_fill='black')
    draw.line(xy(land.exterior.coords),fill='#ffdd33',width=3)
    Image.alpha_composite(image,layer).convert('RGB').save(args.work/name)
render('1153-model-top.png'); render('1153-model-candidates.png',True)
summary={'parcelNo':'1153','crs':'EPSG:3826','resolutionM':resolution,'grid':[x0,y1,w,h],
         'landAreaM2':land.area,'heightThresholdM':2.2,'sources':sources,
         'candidates':[{'id':i+1,'areaM2':p.area,'fullGeometry':mapping(full),'insideGeometry':mapping(p)} for i,(full,p) in enumerate(parts)]}
(args.work/'1153-model-candidates.json').write_text(json.dumps(summary,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in summary.items() if k!='candidates'}))
print(json.dumps([{'id':i+1,'areaM2':p.area} for i,(_,p) in enumerate(parts)]))

if args.publish_candidate:
    assert args.publish_candidate == 1 and len(parts) == 1, '候選已變動，需重新判讀'
    footprint=parts[0][1]
    simplified=footprint.simplify(.025,preserve_topology=True).intersection(land)
    if abs(simplified.area-footprint.area)<.01: footprint=simplified
    assert footprint.is_valid and footprint.difference(land).area<1e-7
    catalog_path=ROOT/'viewer-source/src/taoyuan1013Parcels.json'
    catalog=json.loads(catalog_path.read_text(encoding='utf8'))
    parcel=next(p for p in catalog if p['info']['parcelNo']=='1153')
    area=footprint.area; percent=area/parcel['info']['cadastralAreaM2']*100
    parcel['info'].update(occupiedAreaM2=round(area,4),occupancyPercent=round(percent,5),
        analysisStatus='model-derived',analysisVersion=inputs.get('analysisVersion','20261014-model-1153-v1'),
        analysisNote='依同批 Terra 模型彩色點雲判讀屋頂／雨遮投影，與 TWD97 地籍平面相交；非外業實測建物線，結果待複核。')
    catalog_path.write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf8')
    overlay=ROOT/'viewer-source/public'/parcel['overlayUrl']
    geo=json.loads(overlay.read_text(encoding='utf8'))
    geo['features']=[f for f in geo['features'] if not (f['properties'].get('kind')=='occupancy-building' and f['properties'].get('parcelKey')==parcel['key'])]
    geo['features'].append({'type':'Feature','id':'model-1153-1','properties':{
        'kind':'occupancy-building','parcelKey':parcel['key'],'parcelNo':'1153',
        'sourceCrs':'EPSG:3826','analysisStatus':'model-derived','projectedAreaM2':area},
        'geometry':mapping(transform(forward.transform,footprint))})
    for prefix in ['viewer-source/public','3d-viewer']:
        (ROOT/prefix/parcel['overlayUrl']).write_text(json.dumps(geo,ensure_ascii=False,indent=2),encoding='utf8')
    for source in sources:
        path=Path(inputs['sourceDem']).parents[1]/'terra_las_1_4'/source['name']
        with path.open('rb') as stream: source['sha256']=hashlib.file_digest(stream,'sha256').hexdigest()
    audit={'parcelNo':'1153','crs':'EPSG:3826','method':'模型彩色點雲俯視語意判讀與地籍交集',
        'status':'model-derived','reviewStatus':'待複核','resolutionM':resolution,'heightThresholdM':2.2,
        'smallGapClosingPixels':3,'selectedCandidate':1,'sourceFiles':sources,
        'interpretation':'與白色連續屋頂／雨遮相連的投影，未納入左側道路低處；不是以整筆土地當占用。',
        'rawRasterIntersectionM2':parts[0][1].area,'intersectionAreaM2':area,
        'registeredAreaM2':parcel['info']['cadastralAreaM2'],'percent':percent,
        'footprintTwd97':mapping(footprint),'displayPrecisionNote':'5 cm 為分析網格，不代表界址或占用判讀精度；網站以約數顯示。'}
    (ROOT/'analysis/20261014-taoyuan-1013/model-1153-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'publishedLocal1153':True,'areaM2':area,'percent':percent}))

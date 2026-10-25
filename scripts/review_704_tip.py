"""Local source-evidence review of the user-marked 704-1 corner awning."""
import json, sys, math, struct, hashlib
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUTER = ROOT.parents[1]
sys.path.insert(0, str(OUTER / '.codex-tmp/geospatial-py'))
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from shapely.geometry import shape
from shapely.ops import transform
from pyproj import CRS, Transformer
from PIL import Image, ImageDraw

WORK = ROOT / '.local/704-tip-review-20261025'
WORK.mkdir(parents=True, exist_ok=True)
source = Path(r'D:\DJI\DJITerra\20261006CL\20261013CL')
overlay = json.loads((ROOT / 'viewer-source/public/overlays/taoyuan-1013-v2/block-03.geojson').read_text(encoding='utf8'))
inverse = Transformer.from_crs(4326, 3826, always_xy=True)
land = transform(inverse.transform, shape(overlay['features'][0]['geometry']))
xmin, ymin, xmax, ymax = land.bounds
xmin, ymin = math.floor(xmin - 8), math.floor(ymin - 8)
xmax, ymax = math.ceil(xmax + 8), math.ceil(ymax + 8)
res = .05
w, h = math.ceil((xmax-xmin)/res), math.ceil((ymax-ymin)/res)

def annotate(im, name):
    draw = ImageDraw.Draw(im)
    def pixels(coords): return [((x-xmin)/res, (ymax-y)/res) for x,y in coords]
    draw.line(pixels(land.exterior.coords), fill='#ffdf35', width=4)
    for i,(x,y) in enumerate(list(land.exterior.coords)[:-1]):
        px,py=pixels([(x,y)])[0]
        draw.text((px+6,py-22), f'{chr(65+i)} {x:.2f},{y:.2f}', fill='yellow', stroke_width=1, stroke_fill='black')
    for f in overlay['features']:
        if f['properties'].get('kind')=='occupancy-building':
            p=transform(inverse.transform,shape(f['geometry']))
            draw.line(pixels(p.exterior.coords), fill='#32ff82', width=3)
    for x in range(math.ceil(xmin/10)*10,xmax,10):
        px=(x-xmin)/res
        draw.line([(px,0),(px,h)], fill='#666666', width=1)
        draw.text((px+2,3), str(x), fill='white', stroke_width=1, stroke_fill='black')
    for y in range(math.ceil(ymin/10)*10,ymax,10):
        py=(ymax-y)/res
        draw.line([(0,py),(w,py)], fill='#666666', width=1)
        draw.text((2,py+2), str(y), fill='white', stroke_width=1, stroke_fill='black')
    im.save(WORK/name)

with rasterio.open(source/'map/result.tif') as ds:
    print(json.dumps({'mapCrs':str(ds.crs),'bounds':list(ds.bounds),'rasterBands':ds.count}), flush=True)
    assert CRS(ds.crs).to_2d().to_epsg()==3826
    rgb=ds.read([1,2,3],window=from_bounds(xmin,ymin,xmax,ymax,ds.transform),out_shape=(3,h,w),boundless=True)
    annotate(Image.fromarray(np.moveaxis(rgb,0,2)), '704-map-evidence.png')

cache=WORK/'native-points.npz'
if not cache.exists():
    xyzs=[]; colors=[]; sources=[]
    for path in sorted((source/'models/pc/0/terra_las_1_4').glob('*.las')):
        with path.open('rb') as stream: header=stream.read(375)
        maxx,minx,maxy,miny=struct.unpack_from('<4d',header,179)
        if maxx<xmin or minx>xmax or maxy<ymin or miny>ymax: continue
        fmt=header[104]&63; length=struct.unpack_from('<H',header,105)[0]
        count=struct.unpack_from('<Q',header,247)[0] or struct.unpack_from('<I',header,107)[0]
        scale=np.array(struct.unpack_from('<3d',header,131)); offset=np.array(struct.unpack_from('<3d',header,155))
        rgb_offset={2:20,3:28,5:28,7:30,8:30,10:30}[fmt]
        dtype=np.dtype({'names':['x','y','z','rgb'],'formats':['<i4','<i4','<i4',('<u2',3)],'offsets':[0,4,8,rgb_offset],'itemsize':length})
        pts=np.memmap(path,dtype=dtype,mode='r',offset=struct.unpack_from('<I',header,96)[0],shape=(count,))
        for start in range(0,count,1000000):
            q=pts[start:start+1000000]; x=q['x']*scale[0]+offset[0]; y=q['y']*scale[1]+offset[1]
            keep=(x>=xmin)&(x<xmax)&(y>ymin)&(y<=ymax)
            if not keep.any(): continue
            xyzs.append(np.c_[x[keep],y[keep],q['z'][keep]*scale[2]+offset[2]])
            c=q['rgb'][keep].astype(float)
            if c.max()>255: c/=257
            colors.append(c.astype(np.uint8))
        del pts
        with path.open('rb') as stream: digest=hashlib.file_digest(stream,'sha256').hexdigest()
        sources.append({'name':path.name,'bytes':path.stat().st_size,'sha256':digest})
        print(path.name, flush=True)
    assert xyzs
    np.savez_compressed(cache,xyz=np.concatenate(xyzs),rgb=np.concatenate(colors),sources=json.dumps(sources))
data=np.load(cache); xyz=data['xyz']; rgb=data['rgb']
ix=((ymax-xyz[:,1])/res).astype(int)*w+((xyz[:,0]-xmin)/res).astype(int)
order=np.lexsort((xyz[:,2],ix)); cells=ix[order]
chosen=order[np.r_[cells[1:]!=cells[:-1],True]]
photo=np.zeros((h*w,3),np.uint8); photo[ix[chosen]]=rgb[chosen]
annotate(Image.fromarray(photo.reshape(h,w,3)), '704-native-evidence.png')
(WORK/'grid.json').write_text(json.dumps({'xmin':xmin,'ymax':ymax,'width':w,'height':h,'resolution':res,'crs':'EPSG:3826','sources':json.loads(str(data['sources']))},indent=2),encoding='utf8')
print(json.dumps({'work':str(WORK),'points':len(xyz),'bounds':[xmin,ymin,xmax,ymax]}),flush=True)

# Native point-cloud diagnostic for the western cadastral tip; not a retouched screenshot.
cx0,cy1,cx1,cy0=266081,2761881,266100,2761868
cw,ch=round((cx1-cx0)/.025),round((cy1-cy0)/.025)
keep=(xyz[:,0]>=cx0)&(xyz[:,0]<cx1)&(xyz[:,1]>cy0)&(xyz[:,1]<=cy1)
p=xyz[keep]; c=rgb[keep]
idx=((cy1-p[:,1])/.025).astype(int)*cw+((p[:,0]-cx0)/.025).astype(int)
order=np.lexsort((p[:,2],idx)); cells=idx[order]; chosen=order[np.r_[cells[1:]!=cells[:-1],True]]
pic=np.zeros((ch*cw,3),np.uint8); pic[idx[chosen]]=c[chosen]
im=Image.fromarray(pic.reshape(ch,cw,3));draw=ImageDraw.Draw(im)
pix=lambda coords:[((x-cx0)/.025,(cy1-y)/.025) for x,y in coords]
draw.line(pix(land.exterior.coords),fill='yellow',width=3)
for x in range(cx0,cx1):
    px=(x-cx0)/.025;draw.line([(px,0),(px,ch)],fill='#888888',width=1);draw.text((px+2,2),str(x),fill='white',stroke_width=1,stroke_fill='black')
for y in range(cy0,cy1):
    py=(cy1-y)/.025;draw.line([(0,py),(cw,py)],fill='#888888',width=1);draw.text((2,py+2),str(y),fill='white',stroke_width=1,stroke_fill='black')
im.save(WORK/'704-corner-native.png')
for x,y in [(266087,2761875),(266089,2761875),(266091,2761875),(266093,2761875),(266089,2761873),(266091,2761873),(266093,2761873)]:
    near=p[np.hypot(p[:,0]-x,p[:,1]-y)<.15,2]
    print(json.dumps({'xy':[x,y],'count':len(near),'zPercentiles':np.quantile(near,[.05,.5,.95]).tolist() if len(near) else []}),flush=True)
for low,high in [(120,124),(126,130)]:
    selected=(p[:,2]>low)&(p[:,2]<high)
    q=p[selected];qc=c[selected]
    ix=((cy1-q[:,1])/.025).astype(int)*cw+((q[:,0]-cx0)/.025).astype(int)
    order=np.lexsort((q[:,2],ix)); cells=ix[order]; chosen=order[np.r_[cells[1:]!=cells[:-1],True]]
    pic=np.zeros((ch*cw,3),np.uint8);pic[ix[chosen]]=qc[chosen]
    im=Image.fromarray(pic.reshape(ch,cw,3));d=ImageDraw.Draw(im)
    d.line(pix(land.exterior.coords),fill='yellow',width=3)
    for x in range(cx0,cx1):
        px=(x-cx0)/.025;d.line([(px,0),(px,ch)],fill='#666666',width=1);d.text((px+2,2),str(x),fill='white')
    for y in range(cy0,cy1):
        py=(cy1-y)/.025;d.line([(0,py),(cw,py)],fill='#666666',width=1);d.text((2,py+2),str(y),fill='white')
    im.save(WORK/f'704-corner-z{low}-{high}.png')

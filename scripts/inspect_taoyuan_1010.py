"""Read-only LAS/CAD comparison. Raster evidence and caches remain local."""
import argparse,json,struct,sys,math
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--packages',required=True);p.add_argument('--work',type=Path,required=True);a=p.parse_args();sys.path.insert(0,a.packages)
import numpy as np,ezdxf,rasterio
from rasterio.windows import from_bounds
from shapely.geometry import Polygon,box
from shapely.ops import unary_union
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[1]
config=json.loads((root/'analysis/20261019-taoyuan-1010/cadastral-mapping.json').read_text(encoding='utf8'))
doc=ezdxf.readfile(config['sourceDxf']);a.work.mkdir(parents=True,exist_ok=True)
lands={no:unary_union([Polygon([(v.dxf.location.x,v.dxf.location.y) for v in doc.entitydb[h].vertices]) for h in handles]) for no,handles in config['parcelHandles'].items() if handles}
groups=[('cl1',['17-1']),('cl2-north',['179-71']),('cl2-south',['255-149','255-39','255-41','255-42'])]
inventory=[]
for group,numbers in groups:
 model=Path(r'D:\DJI\DJITerra\20261006CL')/('20261010CL1' if group=='cl1' else '20261010CL2')/'models/pc/0'
 xmin,ymin,xmax,ymax=unary_union([lands[n] for n in numbers]).buffer(10).bounds
 xyzs=[];colors=[]
 cache=a.work/(group+'-points.npz')
 if cache.exists():
  saved=np.load(cache);xyz=saved['xyz'];rgb=saved['rgb']
 else:
  for path in sorted((model/'terra_las_1_4').glob('*.las')):
   with path.open('rb') as f:h=f.read(375)
   maxx,minx,maxy,miny=struct.unpack_from('<4d',h,179)
   if maxx<xmin or minx>xmax or maxy<ymin or miny>ymax:continue
   fmt=h[104]&63;length=struct.unpack_from('<H',h,105)[0];count=struct.unpack_from('<Q',h,247)[0] or struct.unpack_from('<I',h,107)[0]
   scale=np.array(struct.unpack_from('<3d',h,131));offset=np.array(struct.unpack_from('<3d',h,155));color_offset={2:20,3:28,5:28,7:30,8:30,10:30}[fmt]
   dtype=np.dtype({'names':['x','y','z','rgb'],'formats':['<i4','<i4','<i4',('<u2',3)],'offsets':[0,4,8,color_offset],'itemsize':length})
   pts=np.memmap(path,dtype=dtype,mode='r',offset=struct.unpack_from('<I',h,96)[0],shape=(count,))
   for start in range(0,count,1000000):
    q=pts[start:start+1000000];x=q['x']*scale[0]+offset[0];y=q['y']*scale[1]+offset[1];keep=(x>=xmin)&(x<xmax)&(y>ymin)&(y<=ymax)
    if not keep.any():continue
    xyzs.append(np.c_[x[keep],y[keep],q['z'][keep]*scale[2]+offset[2]])
    c=q['rgb'][keep].astype(float)
    if c.max()>255:c/=257
    colors.append(c.astype('uint8'))
  xyz=np.concatenate(xyzs);rgb=np.concatenate(colors);np.savez_compressed(cache,xyz=xyz,rgb=rgb)
 step=.08 if group=='cl1' else .035
 w,hh=math.ceil((xmax-xmin)/step),math.ceil((ymax-ymin)/step)
 ix=((ymax-xyz[:,1])/step).astype(int)*w+((xyz[:,0]-xmin)/step).astype(int)
 order=np.lexsort((xyz[:,2],ix));cells=ix[order];chosen=order[np.r_[cells[1:]!=cells[:-1],True]]
 pixels=np.full((hh*w,3),40,np.uint8);pixels[ix[chosen]]=rgb[chosen]
 im=Image.fromarray(pixels.reshape(hh,w,3));draw=ImageDraw.Draw(im)
 def xy(coords):return [((x-xmin)/step,(ymax-y)/step) for x,y in coords]
 for no in numbers:
  land=lands[no];parts=[land] if land.geom_type=='Polygon' else land.geoms
  for shape in parts:draw.line(xy(shape.exterior.coords),fill='#ffdd33',width=3)
  pt=land.representative_point();draw.text(xy([(pt.x,pt.y)])[0],no,fill='#ffdd33',stroke_width=1,stroke_fill='black')
 for e in doc.modelspace().query('LWPOLYLINE'):
  coords=[(v[0],v[1]) for v in e.get_points()]
  if not any(xmin<x<xmax and ymin<y<ymax for x,y in coords):continue
  draw.line(xy(coords+([coords[0]] if e.closed else [])),fill='#ff55dd',width=2)
  draw.text(xy([coords[0]])[0],e.dxf.handle,fill='white')
 im.save(a.work/(group+'-top-cad.png'))
 inventory.append(dict(group=group,numbers=numbers,imageBounds=[xmin,ymin,xmax,ymax],imageSize=[w,hh],resolution=step,points=len(xyz),heightQuantiles=np.quantile(xyz[:,2],[0,.05,.5,.95,1]).tolist()))
 print(json.dumps(inventory[-1]),flush=True)
(a.work/'inventory.json').write_text(json.dumps(inventory,indent=2),encoding='utf8')

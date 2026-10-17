"""Read-only source crop for interpreting 1013-2; generated evidence stays local."""
import sys, json, struct, argparse
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--packages',required=True);p.add_argument('--work',type=Path,required=True);a=p.parse_args()
sys.path.insert(0,a.packages)
import numpy as np, ezdxf
from shapely.geometry import Polygon,box
from PIL import Image,ImageDraw
base=Path(r'D:\DJI\DJITerra\20261006CL\20261013CL2\models\pc\0')
cad=Path(r'D:\DATA\WORK\20261006桃園三維地籍\地籍資料\1013\1013-2')
land=Polygon([(v.dxf.location.x,v.dxf.location.y) for v in next(iter(ezdxf.readfile(cad/'1013-2.dxf').modelspace())).vertices])
a.work.mkdir(parents=True,exist_ok=True)
xmin,ymin,xmax,ymax=land.buffer(12).bounds
xyzs=[];colors=[]
for path in sorted((base/'terra_las_1_4').glob('*.las')):
 with path.open('rb') as f:h=f.read(375)
 maxx,minx,maxy,miny=struct.unpack_from('<4d',h,179)
 if maxx<xmin or minx>xmax or maxy<ymin or miny>ymax:continue
 fmt=h[104]&63;length=struct.unpack_from('<H',h,105)[0];count=struct.unpack_from('<Q',h,247)[0] or struct.unpack_from('<I',h,107)[0]
 scale=np.array(struct.unpack_from('<3d',h,131));off=np.array(struct.unpack_from('<3d',h,155));rgb_offset={2:20,3:28,5:28,7:30,8:30,10:30}[fmt]
 dtype=np.dtype({'names':['x','y','z','rgb'],'formats':['<i4','<i4','<i4',('<u2',3)],'offsets':[0,4,8,rgb_offset],'itemsize':length})
 pts=np.memmap(path,dtype=dtype,mode='r',offset=struct.unpack_from('<I',h,96)[0],shape=(count,))
 for start in range(0,count,1000000):
  q=pts[start:start+1000000];x=q['x']*scale[0]+off[0];y=q['y']*scale[1]+off[1];keep=(x>=xmin)&(x<xmax)&(y>ymin)&(y<=ymax)
  if not keep.any():continue
  xyzs.append(np.c_[x[keep],y[keep],q['z'][keep]*scale[2]+off[2]])
  color=q['rgb'][keep].astype(float)
  if color.max()>255:color/=257
  colors.append(color.astype(np.uint8))
xyz=np.concatenate(xyzs);rgb=np.concatenate(colors);np.savez_compressed(a.work/'174-points.npz',xyz=xyz,rgb=rgb)
res=.04;w=int(np.ceil((xmax-xmin)/res));height=int(np.ceil((ymax-ymin)/res))
ix=((ymax-xyz[:,1])/res).astype(int)*w+((xyz[:,0]-xmin)/res).astype(int)
order=np.lexsort((xyz[:,2],ix));cells=ix[order];chosen=order[np.r_[cells[1:]!=cells[:-1],True]]
photo=np.zeros((height*w,3),np.uint8);photo[ix[chosen]]=rgb[chosen]
im=Image.fromarray(photo.reshape(height,w,3));d=ImageDraw.Draw(im)
pixel=lambda coords:[((x-xmin)/res,(ymax-y)/res) for x,y in coords]
d.line(pixel(land.exterior.coords),fill='#ffdd33',width=3)
survey=[]
for e in ezdxf.readfile(cad/'1013房屋參考.dxf').modelspace():
 if e.dxftype()=='LWPOLYLINE':coords=[(v[0],v[1]) for v in e.get_points()]
 elif e.dxftype()=='POLYLINE':coords=[(v.dxf.location.x,v.dxf.location.y) for v in e.vertices]
 else:continue
 if coords and any(xmin<x<xmax and ymin<y<ymax for x,y in coords):
  survey.append({'handle':e.dxf.handle,'layer':e.dxf.layer,'closed':e.is_closed,'coords':coords})
  d.line(pixel(coords+([coords[0]] if e.is_closed else [])),fill='#ff66cc',width=2)
im.save(a.work/'174-top-cad.png')
for name,mat in [('west',np.array([[0,-1,0],[-.6,0,.8],[.8,0,.6]])),('south',np.array([[1,0,0],[0,.6,.8],[0,-.8,.6]]))]:
 center=np.array([land.centroid.x,land.centroid.y,129]);projected=(xyz-center)@mat.T
 lo=projected[:,:2].min(axis=0);hi=projected[:,:2].max(axis=0);step=.035
 ww,hh=np.ceil((hi-lo)/step).astype(int)+2
 idx=((hi[1]-projected[:,1])/step).astype(int)*ww+((projected[:,0]-lo[0])/step).astype(int)
 order=np.lexsort((projected[:,2],idx));cell=idx[order];chosen=order[np.r_[cell[1:]!=cell[:-1],True]]
 image=np.zeros((ww*hh,3),np.uint8);image[idx[chosen]]=rgb[chosen]
 pic=Image.fromarray(image.reshape(hh,ww,3));draw=ImageDraw.Draw(pic)
 ring=(np.array([[x,y,128] for x,y in land.exterior.coords])-center)@mat.T
 draw.line([((x-lo[0])/step,(hi[1]-y)/step) for x,y,z in ring],fill='#ffdd33',width=3)
 pic.save(a.work/f'174-{name}.png')
(a.work/'inspection.json').write_text(json.dumps({'land':land.__geo_interface__,'area':land.area,'bounds':[xmin,ymin,xmax,ymax],'resolution':res,'pointCount':len(xyz),'heightQuantiles':np.quantile(xyz[:,2],[0,.1,.25,.5,.75,.9,1]).tolist(),'survey':survey},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'points':len(xyz),'surveyNearby':len(survey),'image':str(a.work/'174-top-cad.png'),'heights':np.quantile(xyz[:,2],[0,.1,.5,.9,1]).tolist()}))

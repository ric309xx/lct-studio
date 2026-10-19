"""Generate model-only top/side evidence around survey search regions, not areas."""
import argparse,json,sys,math
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--packages',required=True);p.add_argument('--work',type=Path,required=True);a=p.parse_args();sys.path.insert(0,a.packages)
import numpy as np,ezdxf
from shapely.geometry import Polygon,box
from shapely.ops import unary_union
from shapely import contains_xy
from PIL import Image,ImageDraw,ImageFont
root=Path(__file__).resolve().parents[1];cfg=json.loads((root/'analysis/20261019-taoyuan-1010/cadastral-mapping.json').read_text(encoding='utf8'))
doc=ezdxf.readfile(cfg['sourceDxf']);lands={n:unary_union([Polygon([(v.dxf.location.x,v.dxf.location.y) for v in doc.entitydb[h].vertices]) for h in hs]) for n,hs in cfg['parcelHandles'].items() if hs}
specs=[('north-shed','cl1',['35F','360']),('middle-shed-1','cl1',['361','362']),('middle-shed-2','cl1',['363','364']),('east-shed','cl1',['365']),('junction-roof','cl2-north',['44E']),('south-sheds','cl2-south',['44A','44B']),('south-corner','cl2-south',['44C','44D']),('north-flat-roof','cl2-south',[])]
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',16)
result=[]
for group in ['cl1','cl2-north','cl2-south']:
 data=np.load(a.work/(group+'-points.npz'));xyz=data['xyz'];rgb=data['rgb']
 for name,g,handles in specs:
  if g!=group:continue
  refs=[Polygon(doc.entitydb[h].get_points('xy')) for h in handles]
  region=unary_union(refs).buffer(3) if refs else box(271716,2760658,271741,2760673)
  xmin,ymin,xmax,ymax=region.bounds
  keep=(xyz[:,0]>=xmin)&(xyz[:,0]<xmax)&(xyz[:,1]>ymin)&(xyz[:,1]<=ymax)
  q=xyz[keep];c=rgb[keep];step=.04
  w,hh=math.ceil((xmax-xmin)/step),math.ceil((ymax-ymin)/step)
  ix=((ymax-q[:,1])/step).astype(int)*w+((q[:,0]-xmin)/step).astype(int)
  order=np.lexsort((q[:,2],ix));cells=ix[order];chosen=order[np.r_[cells[1:]!=cells[:-1],True]]
  pixels=np.full((hh*w,3),35,np.uint8);pixels[ix[chosen]]=c[chosen]
  im=Image.fromarray(pixels.reshape(hh,w,3));draw=ImageDraw.Draw(im)
  xy=lambda coords:[((x-xmin)/step,(ymax-y)/step) for x,y in coords]
  for no,land in lands.items():
   parts=[land] if land.geom_type=='Polygon' else land.geoms
   for part in parts:
    if part.intersects(region):draw.line(xy(part.exterior.coords),fill='yellow',width=3)
  for h in handles:
   e=doc.entitydb[h];coords=e.get_points('xy');draw.line(xy(coords+([coords[0]] if e.closed else [])),fill='#ff55dd',width=2)
   draw.text(xy([coords[0]])[0],h,fill='white',font=font,stroke_width=1,stroke_fill='black')
  im.save(a.work/(name+'-top.png'))
  # Side evidence: x versus Z; actual XYZ/RGB samples, no reconstructed faces.
  z0,z1=np.quantile(q[:,2],[.001,.999]);ss=.025;sw,sh=math.ceil((xmax-xmin)/ss),math.ceil((z1-z0)/ss)+1
  v=(q[:,2]>=z0)&(q[:,2]<=z1);qq=q[v];cc=c[v]
  idx=((z1-qq[:,2])/ss).astype(int)*sw+((qq[:,0]-xmin)/ss).astype(int)
  order=np.lexsort((qq[:,1],idx));cells=idx[order];last=order[np.r_[cells[1:]!=cells[:-1],True]]
  pixels=np.full((sh*sw,3),35,np.uint8);pixels[idx[last]]=cc[last]
  side=Image.fromarray(pixels.reshape(sh,sw,3));d=ImageDraw.Draw(side)
  for z in np.arange(math.ceil(z0),z1,1):d.line([(0,(z1-z)/ss),(sw,(z1-z)/ss)],fill='#555555');d.text((2,(z1-z)/ss),str(z),fill='white',font=font)
  side.save(a.work/(name+'-side.png'))
  record=dict(id=name,group=group,referenceHandles=handles,bounds=[xmin,ymin,xmax,ymax],resolution=step,imageSize=[w,hh],pointCount=len(q),zQuantiles=np.quantile(q[:,2],[.01,.05,.25,.5,.75,.95,.99]).tolist())
  result.append(record);print(json.dumps(record),flush=True)
(a.work/'roof-review-inventory.json').write_text(json.dumps(result,indent=2),encoding='utf8')

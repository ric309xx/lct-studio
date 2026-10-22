"""Display-only local road surface for 255 four-parcel case; CAD XY unchanged."""
import argparse,json,sys,math,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--packages',required=True);p.add_argument('--work',type=Path,required=True);a=p.parse_args();sys.path.insert(0,a.packages)
import numpy as np,ezdxf
from shapely.geometry import Polygon,box
from shapely.ops import unary_union
from shapely import contains_xy
from pyproj import Transformer
root=Path(__file__).resolve().parents[1];out=root/'analysis/20261019-taoyuan-1010'
cfg=json.loads((out/'cadastral-mapping.json').read_text(encoding='utf8'))
doc=ezdxf.readfile(cfg['sourceDxf']);numbers=['255-41','255-42','255-39','255-149']
lands={no:unary_union([Polygon([(v.dxf.location.x,v.dxf.location.y) for v in doc.entitydb[h].vertices]) for h in cfg['parcelHandles'][no]]) for no in numbers}
land=unary_union(list(lands.values()));xyz=np.load(a.work/'cl2-south-points.npz')['xyz'][::4]
q=xyz[contains_xy(land.buffer(4),xyz[:,0],xyz[:,1])]
# Lowest well-supported local horizontal mode rejects vegetation, bikes and
# roofs. Never turn a sparse low outlier or a roof-only cell into a road node.
cells={}
for cell in np.unique(np.floor(q[:,:2]/2).astype(int),axis=0):
 center=(cell+.5)*2;near=q[np.linalg.norm(q[:,:2]-center,axis=1)<2.5]
 if len(near)<80:continue
 bins=np.floor(near[:,2]/.2).astype(int);levels,counts=np.unique(bins,return_counts=True)
 supported=levels[counts>=max(25,len(near)*.04)]
 if not len(supported):continue
 level=supported[0]*.2;low=near[(near[:,2]>=level-.04)&(near[:,2]<level+.3)]
 if len(low)<25:continue
 z=float(np.median(low[:,2]));cells[tuple(cell)]=[float(center[0]),float(center[1]),z,len(low)]
nodes=np.array(list(cells.values()));assert len(nodes)>30
# Broad road-level consensus prevents isolated under-model artifacts being
# interpolated onto a parcel. Height variation is retained within the road band.
zmid=float(np.median(nodes[:,2]));nodes=nodes[np.abs(nodes[:,2]-zmid)<1.5];assert len(nodes)>30
fwd=Transformer.from_crs(3826,4326,always_xy=True).transform
def height(x,y):
 all_distances=np.linalg.norm(nodes[:,:2]-[x,y],axis=1);ids=np.argsort(all_distances)[:8];distances=all_distances[ids];weights=1/np.maximum(distances,.7)**2
 return float(np.sum(nodes[ids,2]*weights)/sum(weights))
def position(x,y):return [*map(lambda v:round(v,10),fwd(x,y)),round(height(x,y),3)]
components=[];areas={};display_area=0
catalog=json.loads((root/'viewer-source/src/taoyuan1010Parcels.json').read_text(encoding='utf8'))
for no in numbers:
 polys=sorted(list(lands[no].geoms) if lands[no].geom_type=='MultiPolygon' else [lands[no]],key=lambda q:q.area,reverse=True)
 area=0
 for index,poly in enumerate(polys):
  pieces=[];minx,miny,maxx,maxy=poly.bounds
  for x in np.arange(math.floor(minx/2)*2,maxx,2):
   for y in np.arange(math.floor(miny/2)*2,maxy,2):
    clipped=poly.intersection(box(x,y,x+2,y+2))
    for g in ([clipped] if clipped.geom_type=='Polygon' else getattr(clipped,'geoms',[])):
     if g.geom_type!='Polygon' or g.area<1e-9:continue
     assert not g.interiors
     pieces.append([position(x,y) for x,y in list(g.exterior.coords)[:-1]]);area+=g.area
  boundary=[]
  for start,end in zip(list(poly.exterior.coords)[:-1],list(poly.exterior.coords)[1:]):
   steps=max(1,math.ceil(math.dist(start,end)))
   boundary.extend(position(start[0]+(end[0]-start[0])*i/steps,start[1]+(end[1]-start[1])*i/steps) for i in range(steps))
  boundary.append(boundary[0]);components.append(dict(parcelKey='sanzuwu-jiushe-'+no,fillEntityId='parcel-1010-'+no+'-fill'+('' if index==0 else '-'+str(index+1)),pieces=pieces,boundary=boundary))
 assert abs(area-lands[no].area)<1e-6;areas[no]=dict(originalAreaM2=lands[no].area,partitionAreaM2=area);display_area+=area
probes=[]
for x,y,z,count in nodes:
 near=q[(np.linalg.norm(q[:,:2]-[x,y],axis=1)<1.2)&(np.abs(q[:,2]-z)<.08)]
 if len(near)<5:continue
 point=near[np.argmin(np.linalg.norm(near[:,:2]-[x,y],axis=1))]
 if all(math.dist(point[:2],p[:2])>3 for p in probes):probes.append(point)
probes=probes[::max(1,len(probes)//32)][:40];assert len(probes)>=10
data=dict(groupKey=next(p['groupKey'] for p in catalog if p['info']['parcelNo']=='255-41'),version='20261020-255-road-v1',sourceCrs='EPSG:3826',sourceVerticalDatum='TWVD2001',displayOnly=True,displayLiftM=.35,components=components,nodes=[[ *fwd(x,y),round(float(z),3)] for x,y,z,_ in nodes],probes=[[*fwd(v[0],v[1]),float(v[2])] for v in probes],areas=areas)
(root/'viewer-source/src/taoyuan255Ground.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
audit=dict(version=data['version'],displayOnly=True,xyAndAreaUnchanged=True,sourceDxfSha256=hashlib.sha256(Path(cfg['sourceDxf']).read_bytes()).hexdigest(),method='2 m local cells; lowest supported 0.2 m mode, road-level consensus, 8-node inverse-distance interpolation',sourceRoadHeightRange=[float(nodes[:,2].min()),float(nodes[:,2].max())],nodeCount=len(nodes),probes=len(probes),components=len(components),pieces=sum(len(c['pieces']) for c in components),areas=areas)
(out/'255-ground-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(audit,ensure_ascii=False))

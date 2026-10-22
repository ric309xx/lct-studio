"""Smooth reviewed 255-149 display only; never edit measured XY or area."""
import argparse,sys,json,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--packages',required=True);a=p.parse_args();sys.path.insert(0,a.packages)
import numpy as np
from shapely.geometry import shape,Polygon,Point,mapping
from shapely.ops import transform,unary_union
from pyproj import Transformer
root=Path(__file__).resolve().parents[1]
relative=Path('overlays/taoyuan-1010-v1/1010-cl2-02.geojson')
data=json.loads((root/'viewer-source/public'/relative).read_text(encoding='utf8'))
unchanged=lambda:json.dumps([{'id':f['id'],'geometry':f['geometry'],'measured':f['properties'].get('projectedAreaM2'),'displayArea':f['properties'].get('displayOnlyProjectionM2'),'occupiedArea':f['properties'].get('occupiedAreaM2'),'cadastralArea':f['properties'].get('cadastralAreaM2'),'componentArea':f['properties'].get('componentAreaM2')} for f in data['features']],sort_keys=True)
before=unchanged();fwd=Transformer.from_crs(3826,4326,always_xy=True).transform;back=Transformer.from_crs(4326,3826,always_xy=True).transform
cad=unary_union([transform(back,shape(f['geometry'])) for f in data['features'] if f['properties']['kind']=='cadastral-fill' and f['properties']['parcelNo']=='255-149'])
audit=[];projection=[]
for f in data['features']:
 props=f['properties']
 if props['kind']=='occupancy-building' and props['parcelNo']=='255-149' and props.get('analysisOnly'):
  props['displaySuppressRawAnalysis']=True
 if props['kind']!='occupancy-display' or props['parcelNo']!='255-149':continue
 original=transform(back,shape(f['geometry']))
 # The isolated 0.084 m2 display fragment is retained in analysis, not drawn
 # as a free-floating green sliver beside the tree crown.
 hidden=original.area<.12
 props['displaySuppressSmallFragment']=hidden
 props['displayCleanRoofSurface']=True
 props['displayMeshHeightRepair']=False
 # Simplify the 5 cm raster steps, round only the outside boundary, and clip
 # against unchanged CAD. Preserve every original semantic exclusion hole.
 exterior=Polygon(original.exterior).simplify(.085,preserve_topology=True)
 exterior=exterior.buffer(.06,quad_segs=3).buffer(-.06,quad_segs=3).simplify(.025,preserve_topology=True)
 holes=unary_union([Polygon(r) for r in original.interiors])
 smooth=exterior.difference(holes).intersection(cad)
 if smooth.geom_type!='Polygon' or smooth.is_empty:raise ValueError(f['id']+' smoothing split the reviewed patch')
 if original.hausdorff_distance(smooth)>.16:raise ValueError(f['id']+' display drift too large')
 coords=mapping(transform(fwd,smooth))['coordinates']
 props['displaySmoothCoordinates']=coords
 samples=np.asarray(props['modelRoofSamples']);lon,lat=samples[:,:2].mean(axis=0)
 x=np.deg2rad(samples[:,0]-lon)*np.cos(np.deg2rad(lat))*6378137
 y=np.deg2rad(samples[:,1]-lat)*6378137
 design=np.c_[np.ones(len(x)),x,y]
 coefficients=np.linalg.lstsq(design,samples[:,2],rcond=None)[0]
 residual=np.max(np.abs(design@coefficients-samples[:,2]))
 if np.hypot(*coefficients[1:])>1 or residual>.35:raise ValueError(f['id']+' is not a supported roof plane')
 props['displayRoofPlane']=[float(lon),float(lat),*coefficients.tolist()]
 if props['analysisRegion'] in ['255-south-lower-gray-awning','255-149-gray-awning-front-extension']:
  projection.append((f,smooth))
 audit.append({'id':f['id'],'hiddenDisplayFragment':hidden,'originalAreaM2':original.area,'displayAreaM2':smooth.area,'originalVertices':len(original.exterior.coords),'displayVertices':len(smooth.exterior.coords),'maxBoundaryDriftM':original.hausdorff_distance(smooth),'roofPlaneMaxResidualM':float(residual)})
assert before==unchanged(),'Measurement geometry changed'
# One external prism outline for the main awning and its front extension.
# Do not draw duplicate walls along the overlap between the two roof layers.
if projection:
 union=unary_union([g for f,g in projection]).simplify(.025,preserve_topology=True)
 if union.geom_type!='Polygon':raise ValueError('Main ground projection must be one connected prism')
 rings=[]
 for ring in [union.exterior,*union.interiors]:
  values=[]
  for east,north in ring.coords:
   lon,lat=fwd(east,north)
   candidates=[f for f,g in projection if g.distance(Point(east,north))<.03]
   heights=[]
   for f in candidates:
    x0,y0,h,sx,sy=f['properties']['displayRoofPlane']
    heights.append(h+sx*np.deg2rad(lon-x0)*np.cos(np.deg2rad(y0))*6378137+sy*np.deg2rad(lat-y0)*6378137)
   if not heights:raise ValueError('Unsupported projection edge')
   values.append([lon,lat,max(heights)])
  rings.append(values)
 primary=next(f for f,g in projection if f['properties']['analysisRegion']=='255-south-lower-gray-awning')
 primary['properties']['displayGroundProjectionRings']=rings
 primary['properties']['displayGroundProjectionVolume']=True
assert before==unchanged(),'Prism preparation changed measurement geometry'
text=json.dumps(data,ensure_ascii=False,indent=2)+'\n'
for base in ['viewer-source/public','3d-viewer']:(root/base/relative).write_text(text,encoding='utf8')
result={'version':'20261022-255-clean-prism-v6','displayOnly':True,'measurementGeometryAndAreasUnchanged':True,'geometryAndAreaSha256':hashlib.sha256(before.encode()).hexdigest(),'method':'fitted roof sheets, one user-requested transparent projection prism to the road/cadastral display surface; no native-mesh recolouring; suppress duplicate raw analysis polygons, preserving their XY and area','prismIsIllustrationNotBuildingVolume':True,'prismHasOnlyExternalUnionWalls':True,'smoothingToleranceM':.085,'roundingRadiusM':.06,'maxAllowedBoundaryDriftM':.16,'hiddenFragmentThresholdM2':.12,'suppressedRawAnalysisCount':sum(f['properties'].get('displaySuppressRawAnalysis') is True for f in data['features']),'patches':audit}
(root/'analysis/20261019-taoyuan-1010/255-clean-display-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(result))

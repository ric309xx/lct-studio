"""Recalculate exported union/intersection and ensure provisional status survives."""
from pathlib import Path
import sys,json,math
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.codex-tmp/geospatial-py'))
import numpy as np
import rasterio.features
from shapely.geometry import shape,Polygon
from shapely.ops import transform,unary_union
from pyproj import Transformer
from affine import Affine
DIR=ROOT/'analysis/20261010-taoyuan-1006'
back=Transformer.from_crs(4326,3826,always_xy=True).transform
results=json.loads((DIR/'interpreted-results.json').read_text(encoding='utf-8'))
projected=json.loads((DIR/'interpreted-footprints-twd97.geojson').read_text(encoding='utf-8'))['features']
display=json.loads((DIR/'interpreted-footprints.geojson').read_text(encoding='utf-8'))['features']
manifest={c['parcelNo']:c for c in json.loads((DIR/'review/manifest.json').read_text())['crops']}
selection={p['parcelNo']:p for p in json.loads((DIR/'interpreted-targets.json').read_text(encoding='utf-8'))['parcels']}
rows=[]
for result in results:
    no=result['parcelNo'];c=manifest[no];aff=Affine(c['resolution'],0,c['minX'],0,-c['resolution'],c['maxY'])
    parcel=Polygon([aff*(x,y) for x,y in c['parcelPixelCoordinates']])
    geoms=[shape(f['geometry']) for f in projected if f['properties']['parcelNo']==no]
    union=unary_union(geoms)
    assert all(g.is_valid and not g.is_empty for g in geoms)
    assert union.difference(parcel).area<1e-6
    assert abs(union.area-result['occupiedAreaM2'])<=.00051
    assert abs(union.area/result['registeredAreaM2']*100-result['occupancyPercent'])<=.000051
    for target in selection[no]['targets']:
        if target.get('excludeHeightAboveGroundM') is None:continue
        surface=np.load(DIR/'review'/(no+'-surface.npz'))
        heights=surface['z']-surface['groundPlane']
        excluded=np.isfinite(heights)&(heights>target['excludeHeightAboveGroundM'])
        mask=unary_union([shape(g) for g,value in rasterio.features.shapes(
            excluded.astype(np.uint8),mask=excluded,transform=aff)]).buffer(target.get('exclusionBufferM',0))
        assert union.intersection(mask).area<1e-7, 'Pole exclusions leaked into occupancy projection'
    for f in display:
        if f['properties']['parcelNo']!=no:continue
        assert f['properties']['analysisStatus']=='interpreted-draft'
        original=shape(next(p['geometry'] for p in projected if p['id']==f['id']))
        assert transform(back,shape(f['geometry'])).hausdorff_distance(original)<1e-5
    for folder in [ROOT/'viewer-source/public/overlays/taoyuan-1006',ROOT/'3d-viewer/overlays/taoyuan-1006']:
        exported=json.loads((folder/(no+'.geojson')).read_text(encoding='utf-8'))
        exported_union=unary_union([transform(back,shape(f['geometry'])) for f in exported['features'] if f['properties']['kind']=='occupancy-building'])
        assert abs(exported_union.area-union.area)<1e-5
        assert (folder/'review'/(no+'-interpreted.png')).exists()
    rows.append(dict(parcelNo=no,areaM2=round(union.area,6),overlapDeduplicatedM2=round(sum(g.area for g in geoms)-union.area,6),
        insideParcel=True,projectedRoundTrip=True,sourceAndPreviewMatch=True,analysisStatus='interpreted-draft',groundSampleCount=c['groundPlane']['class2Samples']))
# Generic union/intersection cases: overlap must not double count, holes and
# outside pieces excluded, registered denominator is not geometric area.
land=Polygon([(0,0),(10,0),(10,10),(0,10)])
a=Polygon([(-2,0),(6,0),(6,5),(-2,5)])
b=Polygon([(4,0),(12,0),(12,5),(4,5)])
assert unary_union([a,b]).intersection(land).area==50
hole=Polygon([(0,0),(10,0),(10,10),(0,10)],holes=[[(2,2),(4,2),(4,4),(2,4)]])
assert hole.intersection(land).area==96
assert 50/500*100==10
report=dict(status='passed',parcels=rows,syntheticCases=['partial-outside','overlap-union','holes','registered-denominator'],
    limitations=['Tests validate computation, not building semantics, roof completeness or cadastral/model alignment accuracy.','5 cm raster sampling is not a 5 cm accuracy claim.','Height below 2.2 m and occluded structures may be absent.'])
(DIR/'draft-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=True,indent=2))

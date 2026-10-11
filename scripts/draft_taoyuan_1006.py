"""Height candidates for visual semantic review; never auto-approve them."""
from pathlib import Path
import sys,json
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.codex-tmp/geospatial-py'))
import numpy as np
import rasterio.features
from affine import Affine
from shapely.geometry import Polygon,shape,mapping
from shapely.ops import unary_union
from PIL import Image,ImageDraw,ImageFilter,ImageFont

REVIEW=ROOT/'analysis/20261010-taoyuan-1006/review'
manifest=json.loads((REVIEW/'manifest.json').read_text())
font=ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf',20)
results=[]
for c in manifest['crops']:
    number=c['parcelNo'];r=c['resolution'];aff=Affine(r,0,c['minX'],0,-r,c['maxY'])
    polygon=Polygon([aff*(x,y) for x,y in c['parcelPixelCoordinates']])
    data=np.load(REVIEW/(number+'-surface.npz'))
    height=data['z']-data['groundPlane']
    mask=np.isfinite(height)&(height>=2.2)
    # 15 cm display-scale closing/opening removes isolated wire/noise pixels.
    im=Image.fromarray(mask.astype(np.uint8)*255)
    im=im.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    im=im.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    mask=np.asarray(im)>0
    candidates=[]
    for geom,val in rasterio.features.shapes(mask.astype(np.uint8),mask=mask,transform=aff):
        full=shape(geom);inside=full.intersection(polygon)
        if inside.area<.08:continue
        candidates.append((full,inside))
    candidates.sort(key=lambda p:p[1].area,reverse=True)
    photo=Image.open(REVIEW/(number+'-parcel.png')).convert('RGBA');layer=Image.new('RGBA',photo.size);draw=ImageDraw.Draw(layer)
    rows=[]
    for idx,(full,inside) in enumerate(candidates,1):
        geoms=[inside] if inside.geom_type=='Polygon' else [g for g in inside.geoms if g.geom_type=='Polygon']
        for g in geoms:
            xy=[((x-c['minX'])/r,(c['maxY']-y)/r) for x,y in g.exterior.coords]
            draw.polygon(xy,fill=(255,0,90,100),outline='white')
        a=inside.representative_point();xy=((a.x-c['minX'])/r,(c['maxY']-a.y)/r)
        draw.text(xy,str(idx),font=font,fill='white',stroke_width=2,stroke_fill='black')
        rows.append(dict(id=idx,areaM2=round(inside.area,3),pixelAnchor=list(xy),fullGeometry=mapping(full),insideGeometry=mapping(inside)))
    Image.alpha_composite(photo,layer).convert('RGB').save(REVIEW/(number+'-candidates.png'))
    results.append(dict(parcelNo=number,candidates=rows))
(REVIEW/'height-candidates.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps([{**{'parcelNo':p['parcelNo']},'candidates':[{k:c[k] for k in ['id','areaM2','pixelAnchor']} for c in p['candidates']]} for p in results],indent=2))

"""Create explicitly provisional, editable occupancy from interpreted selections.

Uses EPSG:3826 planar union/intersection, never Cesium surface area. Re-run
prepare_taoyuan_1006.py afterwards to merge the generated draft into the viewer.
"""
from pathlib import Path
import sys,json,shutil
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.codex-tmp/geospatial-py'))
import numpy as np
import rasterio.features
from affine import Affine
from shapely.geometry import Polygon,shape,mapping
from shapely.ops import unary_union,transform
from pyproj import Transformer
from PIL import Image,ImageDraw,ImageFont
DIR=ROOT/'analysis/20261010-taoyuan-1006';REVIEW=DIR/'review'
selection=json.loads((DIR/'interpreted-targets.json').read_text(encoding='utf-8'))
manifest={c['parcelNo']:c for c in json.loads((REVIEW/'manifest.json').read_text())['crops']}
candidates={p['parcelNo']:p['candidates'] for p in json.loads((REVIEW/'height-candidates.json').read_text())}
inputs={p['parcelNo']:p for p in json.loads((DIR/'parcel-inputs.json').read_text(encoding='utf-8'))['parcels']}
forward=Transformer.from_crs(3826,4326,always_xy=True).transform
font=ImageFont.truetype('C:/Windows/Fonts/msjh.ttc',18)
small=ImageFont.truetype('C:/Windows/Fonts/msjh.ttc',15)

def polys(geom):
    if geom.is_empty:return []
    if geom.geom_type=='Polygon':return [geom]
    if not hasattr(geom,'geoms'):return []
    return [p for g in geom.geoms for p in polys(g)]

results=[];features=[];projected=[];panels=[]
for p in selection['parcels']:
    no=p['parcelNo'];c=manifest[no];aff=Affine(c['resolution'],0,c['minX'],0,-c['resolution'],c['maxY'])
    parcel=Polygon([aff*(x,y) for x,y in c['parcelPixelCoordinates']])
    targets=[];parts=[]
    for t in p['targets']:
        full=shape(next(q['fullGeometry'] for q in candidates[no] if q['id']==t['candidateId']))
        if t.get('clipPixelRings'):
            roi=unary_union([Polygon([aff*(x,y) for x,y in ring]) for ring in t['clipPixelRings']])
            full=full.intersection(roi)
        # 10 cm simplification is subordinate to surveyed parcel geometry.
        full=full.simplify(.10,preserve_topology=True)
        if t.get('excludeHeightAboveGroundM') is not None:
            # A manually reviewed parcel-specific exclusion, not a generic
            # building classifier: tall pole/crossarm cells overlap this eave.
            surface=np.load(REVIEW/(no+'-surface.npz'))
            heights=surface['z']-surface['groundPlane']
            excluded=np.isfinite(heights)&(heights>t['excludeHeightAboveGroundM'])
            mask=unary_union([shape(g) for g,value in rasterio.features.shapes(
                excluded.astype(np.uint8),mask=excluded,transform=aff)])
            full=full.difference(mask.buffer(t.get('exclusionBufferM',0)))
        inside=unary_union([g for g in polys(full.intersection(parcel)) if g.area>=.01])
        assert inside.is_valid and inside.area>0
        parts.append(inside)
        targets.append({**t,'selectedProjectionAreaM2':round(inside.area,3)})
        for i,g in enumerate(polys(inside)):
            if g.area<.01:continue
            properties={'kind':'occupancy-building','parcelKey':'sanzuwu-sanzuwu-'+no,'parcelNo':no,
                'analysisStatus':'interpreted-draft','analysisVersion':selection['analysisVersion'],
                'targetId':t['id'],'category':t['category'],'confidence':t['confidence'],'sourceCrs':'EPSG:3826','note':t['note'],
                'displayWallContinuity':t.get('displayWallContinuity',False)}
            features.append({'type':'Feature','id':t['id']+'-'+str(i),'properties':properties,'geometry':mapping(transform(forward,g))})
            projected.append({'type':'Feature','id':t['id']+'-'+str(i),'properties':properties,'geometry':mapping(g)})
    union=unary_union(parts)
    assert union.is_valid and union.difference(parcel).area<1e-7
    area=union.area;registered=inputs[no]['registeredAreaM2']
    # Sensitivity is geometric +/- 15 cm roof boundary adjustment only, NOT
    # statistical accuracy or a substitute for parcel/model alignment checks.
    low=unary_union([g.buffer(-.15) for g in parts]).intersection(parcel).area
    high=unary_union([g.buffer(.15) for g in parts]).intersection(parcel).area
    record={'parcelNo':no,'analysisStatus':'interpreted-draft','analysisVersion':selection['analysisVersion'],
        'registeredAreaM2':registered,'occupiedAreaM2':round(area,3),'occupancyPercent':round(area/registered*100,4),
        'targetCount':len(targets),'targets':targets,'pending':p['pending'],'excluded':p['excluded'],
        'boundarySensitivity15cmM2':[round(low,3),round(high,3)],'sensitivityWarning':'Only +/- 0.15 m selected outline buffering; not positional accuracy or a confidence interval.',
        'analysisNote':'AI 初步判讀／待複核：僅計入已判讀之建物、棚架與雨遮投影聯集；'+p['pending']+' 已排除樹木、車輛與號誌電線。比例以登記面積為分母，不是正式鑑界或完整占用認定。'}
    results.append(record)
    photo=Image.open(REVIEW/(no+'-parcel.png')).convert('RGBA');layer=Image.new('RGBA',photo.size);draw=ImageDraw.Draw(layer)
    xy=lambda g:[((x-c['minX'])/c['resolution'],(c['maxY']-y)/c['resolution']) for x,y in g.exterior.coords]
    for g in polys(union):
        draw.polygon(xy(g),fill=(35,240,110,125),outline=(20,255,100,255),width=2)
        for hole in g.interiors:
            draw.polygon([((x-c['minX'])/c['resolution'],(c['maxY']-y)/c['resolution']) for x,y in hole.coords],fill=(0,0,0,0))
    for ring in p.get('uncertainPixelRings',[]):draw.line(ring+[ring[0]],fill='orange',width=4)
    composed=Image.alpha_composite(photo,layer).convert('RGB')
    # Legend outside the image; avoid concealing target evidence.
    final=Image.new('RGB',(composed.width,composed.height+90),'#152128');final.paste(composed,(0,90));d=ImageDraw.Draw(final)
    d.text((12,8),f'{no}｜待複核',font=font,fill='white')
    d.text((12,37),f'已判讀投影約 {area:.1f} m²；約 {area/registered*100:.1f}%（登記 {registered} m²）',font=small,fill='white')
    d.text((12,64),'綠色：暫納建物／棚架／雨遮；橘框：待釐清，未計入',font=small,fill='#4af28b')
    final.save(REVIEW/(no+'-interpreted.png'))
    for destination in [ROOT/'viewer-source/public/overlays/taoyuan-1006/review', ROOT/'3d-viewer/overlays/taoyuan-1006/review']:
        destination.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(REVIEW/(no+'-interpreted.png'),destination/(no+'-interpreted.png'))
    # Equal-sized review gallery, preserving image aspect ratio.
    panel=Image.new('RGB',(530,650),'#152128');thumb=final.copy();thumb.thumbnail((530,650));panel.paste(thumb,((530-thumb.width)//2,0));panels.append(panel)

(DIR/'interpreted-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
for name,fs in [('interpreted-footprints.geojson',features),('interpreted-footprints-twd97.geojson',projected)]:
    data={'type':'FeatureCollection','analysisStatus':'interpreted-draft','sourceCrs':'EPSG:3826','features':fs}
    if 'twd97' in name:data['crs']={'type':'name','properties':{'name':'EPSG:3826'}}
    (DIR/name).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
gallery=Image.new('RGB',(530*3,650*2),'#152128')
for i,panel in enumerate(panels):gallery.paste(panel,((i%3)*530,(i//3)*650))
gallery.save(REVIEW/'interpreted-overview.jpg',quality=92)
print(json.dumps([{k:p[k] for k in ['parcelNo','occupiedAreaM2','occupancyPercent','targetCount']} for p in results],indent=2))

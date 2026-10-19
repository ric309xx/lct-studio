"""Add verified DXF boundaries without silently substituting survey footprints.

Run prepare_taoyuan_1010.py first to seed metadata, then this importer. Existing
1013/1015 catalogs are never written. Occupancy remains explicitly uncomputed.
"""
import argparse,hashlib,json,sys,copy
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--packages',required=True);a=p.parse_args();sys.path.insert(0,a.packages)
import ezdxf
from shapely.geometry import Polygon,Point,mapping
from shapely.ops import unary_union,transform
from pyproj import Transformer
root=Path(__file__).resolve().parents[1];out=root/'analysis/20261019-taoyuan-1010'
config=json.loads((out/'cadastral-mapping.json').read_text(encoding='utf8'))
source=Path(config['sourceDxf']);doc=ezdxf.readfile(source)
catalog=json.loads((root/'viewer-source/src/taoyuan1010Parcels.json').read_text(encoding='utf8'))
if not any(p['info']['parcelNo']=='255-42' for p in catalog):
    item=copy.deepcopy(next(p for p in catalog if p['info']['parcelNo']=='255-41'))
    item.update(key='sanzuwu-jiushe-255-42',label='三座屋段舊社小段 255-42 地號')
    item['info'].update(parcelNo='255-42',cadastralAreaM2=202,registrationDate='民國067年08月17日',announcedLandValue='108,000 元／平方公尺',rightsCategory='國有:100.00%')
    item['focus'].update(longitude=121.215242,latitude=24.953582)
    catalog.append(item)
by_number={item['info']['parcelNo']:item for item in catalog}
catalog=[by_number[no] for no in config['includedParcelOrder']]
fwd=Transformer.from_crs(3826,4326,always_xy=True).transform
back=Transformer.from_crs(4326,3826,always_xy=True).transform
features={};audit=[]
for item in catalog:
    no=item['info']['parcelNo'];handles=config['parcelHandles'][no]
    info=item['info'];info['analysisVersion']='20261019-1010-confirmed-parcels-v3'
    for key in ['occupiedAreaM2','occupancyPercent','geometryAreaM2']:
        info.pop(key,None)
    info['integrationCoordinateSystem']='TWD97 二度 TM（EPSG:3826）'
    info['crs']='CAD及模型平面 EPSG:3826；模型高程 TWVD2001'
    assert handles,('confirmed parcel requires boundary',no)
    polygons=[]
    for handle in handles:
        entity=doc.entitydb[handle];assert entity.dxftype()=='POLYLINE' and entity.is_closed
        poly=Polygon([(v.dxf.location.x,v.dxf.location.y) for v in entity.vertices]);assert poly.is_valid
        polygons.append(poly)
    land=unary_union(polygons);assert land.is_valid
    x,y=back(item['focus']['longitude'],item['focus']['latitude'])
    assert land.covers(Point(x,y)),(no,'reference point outside boundary')
    registered=info['cadastralAreaM2'];delta=100*(land.area/registered-1)
    note=f'依1010.dxf原始地籍匯入，共{len(handles)}片；圖資雲點位核對地號。CAD幾何面積{land.area:.3f} m²，登記面積{registered} m²，差異{delta:+.2f}%；保留原始界線不縮放。建物／鐵皮／棚架以模型判讀，實測CAD僅參考；占用尚未完成，未分析不代表零占用。'
    if abs(delta)>5:
        note+=' 本筆CAD與登記面積差異較大，完整性與界線需複核；不得作正式鑑界或完整占用認定。'
    info.update(geometryAreaM2=round(land.area,6),analysisStatus='awaiting-building-confirmation',analysisNote=note)
    item['boundaryStatus']='available';item['fillEntityId']='parcel-1010-'+no+'-fill'
    props=dict(parcelKey=item['key'],parcelNo=no,sectionName=info['sectionName'],groupKey=item['groupKey'],sourceCrs='EPSG:3826',dxfHandles=handles,cadastralAreaM2=registered,geometryAreaM2=land.area,analysisStatus=info['analysisStatus'],geometryAreaDifferencePercent=delta)
    parts=sorted([land] if land.geom_type=='Polygon' else list(land.geoms),key=lambda p:p.area,reverse=True)
    for index,part in enumerate(parts):
        geo=transform(fwd,part);assert geo.is_valid
        fill=item['fillEntityId']+('' if index==0 else '-'+str(index+1))
        ff=[dict(type='Feature',id=fill,properties={**props,'kind':'cadastral-fill','componentAreaM2':part.area},geometry=mapping(geo)),dict(type='Feature',id=fill.replace('-fill','-boundary'),properties={**props,'kind':'cadastral-boundary'},geometry=dict(type='LineString',coordinates=list(geo.exterior.coords)))]
        features.setdefault(item['overlayUrl'],[]).extend(ff)
    audit.append(dict(parcelNo=no,handles=handles,boundaryAvailable=True,cadAreaM2=land.area,registeredAreaM2=registered,areaDifferencePercent=delta,referencePointInside=True,occupancyComputed=False))
def write(path,data):
    path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
write(root/'viewer-source/src/taoyuan1010Parcels.json',catalog)
for url,ff in features.items():
    for base in ['viewer-source/public','3d-viewer']:
        write(root/base/url,dict(type='FeatureCollection',features=ff))
write(out/'cadastral-audit.json',dict(version='20261019-1010-confirmed-parcels-v3',sourceDxf=str(source),sourceDxfSha256=hashlib.sha256(source.read_bytes()).hexdigest(),parcels=audit,excludedQueryReferences=config['excludedQueryReferences'],sourceCrs='EPSG:3826',occupancyComputed=False,referenceCadUsedForOccupancy=False,modelCadAccuracyValidated=False,note='NLSC點位及模型俯視作位置交叉檢查；不代表獨立控制點精度檢核。建物參考線不直接作占用輪廓。'))
print(json.dumps(audit,ensure_ascii=False))

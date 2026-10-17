"""外業房屋參考線與地籍的 TWD97 平面交集，非法律占用認定。"""
import argparse,sys,json,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--packages',type=Path);a=p.parse_args()
if a.packages:sys.path.insert(0,str(a.packages))
import ezdxf
from shapely.geometry import Polygon,LineString,mapping
from shapely.ops import unary_union,transform
from pyproj import Transformer
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'analysis/20261014-taoyuan-1013'
inputs=json.loads((OUT/'parcel-inputs.json').read_text(encoding='utf8'))
src=Path(inputs.get('sourceSurveyDxf',r'D:\DATA\WORK\20261006桃園三維地籍\02成果\1013\1013房屋參考.dxf'))
original=ezdxf.readfile(inputs['sourceDxf']);d=ezdxf.readfile(src)
lands={p['parcelNo']:Polygon([(v.dxf.location.x,v.dxf.location.y) for v in original.entitydb[p['dxfHandle']].vertices]) for p in inputs['parcels']}
all_land=unary_union(list(lands.values()))
reference_lands=[Polygon([(v.dxf.location.x,v.dxf.location.y) for v in e.vertices]) for e in d.modelspace().query('POLYLINE') if e.is_closed]
assert all(min(g.hausdorff_distance(r) for r in reference_lands)<.001 for g in lands.values())
shapes=[];closures=[]
for handle in ['98DB','98DC','98DD','A788']:
 e=d.entitydb[handle];xy=list(e.get_points('xy'));shape=Polygon(xy)
 assert shape.is_valid
 closing=LineString([xy[-1],xy[0]])
 if handle=='98DB':
  measured=LineString(d.entitydb['98D8'].get_points('xy'))
  assert closing.hausdorff_distance(measured)<.001
  method='與實測 98D8 線共同閉合'
 elif e.closed:method='來源已閉合'
 else:
  # 不可在地籍內新增假定邊；外側連接僅供裁切，結果保留待複核。
  assert closing.intersection(all_land).length<.001
  method='開放線外側連接；連接線完全在本次地籍外，交集待複核'
 shapes.append(shape);closures.append({'handle':handle,'layer':e.dxf.layer,'closure':method,'closureLengthInsideParcelsM':closing.intersection(all_land).length})
union=unary_union(shapes)
forward=Transformer.from_crs(3826,4326,always_xy=True).transform
catalog_path=ROOT/'viewer-source/src/taoyuan1013Parcels.json'
catalog=json.loads(catalog_path.read_text(encoding='utf8'))
groups={}
for item in catalog:
 path=ROOT/'viewer-source/public'/item['overlayUrl']
 groups.setdefault(item['groupKey'],json.loads(path.read_text(encoding='utf8')))
for geo in groups.values():geo['features']=[f for f in geo['features'] if f['properties']['kind']!='occupancy-building' or f['properties'].get('analysisStatus')=='model-derived']
results=[]
for item in catalog:
 number=item['info']['parcelNo'];land=lands[number];intersection=land.intersection(union)
 area=intersection.area
 info=item['info']
 # 模型判讀由獨立流程維護，不因外業線未涵蓋而重置。
 if info.get('analysisStatus')=='model-derived':
  results.append({'parcelNo':number,'intersectionAreaM2':round(area,6),'status':'model-derived-preserved','note':'外業線無交集，模型判讀結果另見 model-1153-audit.json'})
  continue
 # 沒有參考線不等於已證實零占用。
 if area<.001:
  info.pop('occupiedAreaM2',None);info.pop('occupancyPercent',None)
  info['analysisStatus']='awaiting-building-confirmation'
  info['analysisNote']='外業參考圖在本地號未提供可確認交集；不代表零占用。'
 else:
  info.update(occupiedAreaM2=round(area,4),occupancyPercent=round(area/info['cadastralAreaM2']*100,5),
              analysisStatus='survey-reference',analysisVersion='20261014-field-reference-v1',
              analysisNote='依外業房屋參考線與地籍之 TWD97 平面交集計算；未計入牆面表面積，尚待複核範圍完整性與線別。')
  parts=[intersection] if intersection.geom_type=='Polygon' else list(intersection.geoms)
  for index,part in enumerate(parts):
   if part.geom_type!='Polygon' or part.area<.000001:continue
   groups[item['groupKey']]['features'].append({'type':'Feature','id':f'field-{number}-{index}',
     'properties':{'kind':'occupancy-building','parcelKey':item['key'],'parcelNo':number,
                   'sourceCrs':'EPSG:3826','analysisStatus':'survey-reference','projectedAreaM2':part.area},
     'geometry':mapping(transform(forward,part))})
 results.append({'parcelNo':number,'intersectionAreaM2':round(area,6),'registeredAreaM2':info['cadastralAreaM2'],
                 'percent':info.get('occupancyPercent'),'status':info['analysisStatus']})
for item in catalog:
 for prefix in ['viewer-source/public','3d-viewer']:
  (ROOT/prefix/item['overlayUrl']).write_text(json.dumps(groups[item['groupKey']],ensure_ascii=False,indent=2),encoding='utf8')
catalog_path.write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf8')
audit={'source':str(src),'sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'crs':'EPSG:3826',
       'referenceParcelMatchToleranceM':.001,'closures':closures,'excludedOutsideParcels':['98DA'],
       'sourceHeightsUsedForArea':False,'results':results}
(OUT/'survey-reference-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(audit,ensure_ascii=False,indent=2))

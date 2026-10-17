"""Stage the reviewed 1013-1 model update at versioned URLs; preserve legacy overlays."""
import argparse,json,hashlib,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);p.add_argument('--manifest',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'analysis/20261014-taoyuan-1013'
inputs=json.loads((out/'parcel-inputs.json').read_text(encoding='utf8'))
manifest=json.loads(a.manifest.read_text(encoding='utf8'))
catalog_path=root/'viewer-source/src/taoyuan1013Parcels.json'
catalog=json.loads(catalog_path.read_text(encoding='utf8'))
baseline=json.loads(subprocess.check_output(['git','show','50e1a71:viewer-source/src/taoyuan1013Parcels.json'],cwd=root))
already_versioned=all(p['tilesetPath']=='1013-v2/tileset.json' for p in catalog)
rows=[]
for parcel,old in zip(catalog,baseline):
 assert parcel['key']==old['key']
 parcel['tilesetPath']='1013-v2/tileset.json'
 parcel['overlayUrl']=parcel['overlayUrl'].replace('taoyuan-1013/','taoyuan-1013-v2/')
 if parcel['info']['analysisStatus']=='model-derived':
  parcel['info']['analysisVersion']=inputs['analysisVersion']
  parcel['info']['analysisNote']='依更新控制點之新版模型判讀建物／棚架／雨遮投影，與原 TWD97 地籍求交；CAD 房屋線僅供參考，待複核。1121 僅已判讀目標，不代表全路段清查。'
 else:
  parcel['info']['analysisNote']='此為既有外業參考線交集值，未隨新版模型重算；僅供對照，尚待模型複核。'
 rows.append({'parcelNo':parcel['info']['parcelNo'],'group':parcel['groupKey'],'oldAreaM2':old['info'].get('occupiedAreaM2'),'newAreaM2':parcel['info'].get('occupiedAreaM2'),'status':parcel['info']['analysisStatus']})
for group in ['01','02','03']:
 relative=f'overlays/taoyuan-1013/block-{group}.geojson'
 versioned=relative.replace('taoyuan-1013/','taoyuan-1013-v2/')
 current=(root/'viewer-source/public'/(versioned if already_versioned else relative)).read_bytes()
 legacy=subprocess.check_output(['git','show',f'50e1a71:viewer-source/public/{relative}'],cwd=root)
 for base in [root/'viewer-source/public',root/'3d-viewer']:
  dest=base/versioned;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(current)
  (base/relative).write_bytes(legacy)
catalog_path.write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf8')
source_hash=hashlib.sha256(Path(inputs['sourceDxf']).read_bytes()).hexdigest()
old_audit=json.loads((out/'import-audit.json').read_text(encoding='utf8'))
assert source_hash==old_audit['sourceSha256'],'DXF changed; cadastral geometry requires separate review'
record={'version':inputs['analysisVersion'],'scope':'1013-1 三區七地號；不處理1013-2','sourceDxf':inputs['sourceDxf'],'sourceDxfSha256':source_hash,'cadUnchanged':True,'sourceTilesRoot':manifest['root'],'objectCount':manifest['objectCount'],'bytes':manifest['bytes'],'jsonCount':manifest['jsonCount'],'unreachable':manifest['unreachable'],'rootTilesetSha256':next(x['sha256'] for x in manifest['objects'] if x['relative']=='tileset.json'),'r2Prefix':'projects/taoyuan/20261013-v2/terra_b3dms/','legacyR2Preserved':True,'viewerTilesetPath':'1013-v2/tileset.json','legacyOverlaysPreserved':True,'parcels':rows,'comparison':json.loads((a.work/'model-comparison.json').read_text()),'notes':['Approximate texture displacement updates only semantic search ROIs; neither CAD nor model coordinates are translated.','Survey-reference areas are retained as reference, not relabelled as model-derived.','Model-derived area estimates recalculated from new source LAS; pending review, not a legal occupancy determination.']}
(out/'model-update-20261017.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(rows,ensure_ascii=False))

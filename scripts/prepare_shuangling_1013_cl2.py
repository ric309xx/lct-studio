"""Import the independently reviewed 1013-2 model/174 parcel without altering 1013-1."""
import argparse,sys,json,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--packages',required=True);p.add_argument('--manifest',type=Path,required=True);a=p.parse_args();sys.path.insert(0,a.packages)
import ezdxf,numpy as np,rasterio
from shapely.geometry import Polygon,Point,mapping
from shapely.ops import transform
from pyproj import Transformer,CRS
root=Path(__file__).resolve().parents[1]
source=Path(r'D:\DATA\WORK\20261006桃園三維地籍\地籍資料\1013\1013-2\1013-2.dxf')
model=Path(r'D:\DJI\DJITerra\20261006CL\20261013CL2\models\pc\0')
entities=list(ezdxf.readfile(source).modelspace());assert len(entities)==1
e=entities[0];assert e.dxftype()=='POLYLINE' and e.is_closed
land=Polygon([(v.dxf.location.x,v.dxf.location.y) for v in e.vertices]);assert land.is_valid and abs(land.area-29.51)<.01
assert land.contains(Point(266975.342,2761175.914))
fwd=Transformer.from_crs(3826,4326,always_xy=True).transform
anchor=land.representative_point();lon,lat=fwd(anchor.x,anchor.y)
with rasterio.open(model/'terra_dem/dem.tif') as dem:
 crs=CRS(dem.crs);horizontal=crs.sub_crs_list[0] if crs.is_compound else crs
 assert horizontal.to_epsg()==3826
 z=float(next(dem.sample([(anchor.x,anchor.y)]))[0]);assert np.isfinite(z) and z!=dem.nodata
info=json.loads((root/'viewer-source/src/taoyuan1013Parcels.json').read_text(encoding='utf8'))[0]['info'].copy()
for key in ['occupiedAreaM2','occupancyPercent','analysisVersion']:info.pop(key,None)
note='依 1013-2 原始 TWD97 地籍與模型匯入。俯視、側視交叉檢視，地籍內高點主要為電桿／線路；尚未確認建物、鐵皮或棚架之占用投影，不以高點或外業參考線直接推算面積，待複核。'
info.update(parcelNo='174',registrationDate='民國092年11月07日',announcedLandValue='91,900 元／平方公尺',rightsCategory='省市 100.00%',cadastralAreaM2=29.51,geometryAreaM2=round(land.area,6),analysisStatus='awaiting-building-confirmation',analysisNote=note)
key='shuangling-174';group='shuangling-1013-cl2-01';fill='parcel-1013-cl2-174-fill';url='overlays/taoyuan-1013-cl2-v1/parcel-174.geojson'
parcel={'key':key,'label':'雙嶺段 174 地號','groupKey':group,'groupLabel':'雙嶺段｜174','fillEntityId':fill,'info':info,'overlayUrl':url,'tilesetPath':'1013-cl2/tileset.json','focus':{'longitude':lon,'latitude':lat,'height':z+65,'headingDegrees':0,'pitchDegrees':-65,'rollDegrees':0}}
geo=transform(fwd,land);props={'parcelKey':key,'parcelNo':'174','sectionName':'雙嶺段','groupKey':group,'sourceCrs':'EPSG:3826','dxfHandle':e.dxf.handle,'cadastralAreaM2':29.51,'geometryAreaM2':land.area,'analysisStatus':info['analysisStatus']}
features=[{'type':'Feature','id':fill,'properties':{**props,'kind':'cadastral-fill'},'geometry':mapping(geo)},{'type':'Feature','id':fill.replace('-fill','-boundary'),'properties':{**props,'kind':'cadastral-boundary'},'geometry':{'type':'LineString','coordinates':list(geo.exterior.coords)}}]
def write(path,data):
 path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
write(root/'viewer-source/src/taoyuan1013Cl2Parcels.json',[parcel])
for base in ['viewer-source/public','3d-viewer']:write(root/base/url,{'type':'FeatureCollection','features':features})
manifest=json.loads(a.manifest.read_text(encoding='utf8'));assert manifest['objectCount']==len(manifest['objects']) and not manifest['unreachable']
audit={'version':'20261018-1013-cl2-v1','scope':'1013-2 雙嶺段174；不修改1013-1','sourceDxf':str(source),'sourceDxfSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'dxfHandle':e.dxf.handle,'sourceCrs':'EPSG:3826','sourceHeightDatum':'TWVD2001; not Cesium ellipsoid heights','sourceModel':str(model),'registeredAreaM2':29.51,'geometryAreaM2':land.area,'referencePointInside':True,'anchorDemHeight':z,'occupancyComputed':False,'reviewNote':note,'excludedObjects':['utility poles','overhead wires','vehicles'],'referenceCadUsedForArea':False,'modelObjects':manifest['objectCount'],'modelBytes':manifest['bytes'],'jsonCount':manifest['jsonCount'],'rootTilesetSha256':next(o['sha256'] for o in manifest['objects'] if o['relative']=='tileset.json'),'r2Prefix':'projects/taoyuan/20261013-cl2-v1/terra_b3dms/','qualityReport':{'images':336,'gcpCount':4,'gcpRmseM':[.037321,.041748,.173285],'independentCheckPointReported':False,'note':'GCP fit residuals are not independent cadastral overlay accuracy; CL20 dz=0.297441m.'}}
write(root/'analysis/20261018-taoyuan-1013-cl2/import-audit.json',audit)
print(json.dumps(audit,ensure_ascii=False))

"""Reproducible DXF import; optionally merge explicitly interpreted draft data."""
from pathlib import Path
import sys, json, hashlib

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.codex-tmp/geospatial-py'))
import ezdxf
import rasterio
from shapely.geometry import Polygon, Point, mapping
from shapely.ops import transform
from pyproj import Transformer

source = Path(r'D:\DATA\WORK\20261006桃園三維地籍\地籍資料\01_1006\1006.dxf')
dem = Path(r'D:\DJI\DJITerra\20261006CL\20261006CL\models\pc\0\terra_dem\dem.tif')
inputs_path = ROOT / 'analysis/20261010-taoyuan-1006/parcel-inputs.json'
inputs = json.loads(inputs_path.read_text(encoding='utf-8'))
draft_path = inputs_path.parent / 'interpreted-results.json'
drafts = {p['parcelNo']:p for p in json.loads(draft_path.read_text(encoding='utf-8'))} if draft_path.exists() else {}
draft_footprints_path = inputs_path.parent / 'interpreted-footprints.geojson'
draft_features = json.loads(draft_footprints_path.read_text(encoding='utf-8'))['features'] if drafts else []
forward = Transformer.from_crs(3826, 4326, always_xy=True).transform
entities = {e.dxf.handle:e for e in ezdxf.readfile(source).modelspace()}
assert len(entities) == 6
catalog, features, audit = [], [], []
with rasterio.open(dem) as terrain:
    assert terrain.crs.to_epsg() == 3826 or '3826' in terrain.crs.to_wkt()
    for parcel in inputs['parcels']:
        number = parcel['parcelNo']
        entity = entities[parcel['dxfHandle']]
        assert entity.dxftype() == 'POLYLINE' and entity.is_closed
        ring = [(v.dxf.location.x,v.dxf.location.y) for v in entity.vertices]
        polygon = Polygon(ring)
        assert polygon.is_valid and polygon.area > 0
        assert polygon.contains(Point(parcel['referencePointTwd97']))
        anchor = polygon.representative_point()
        longitude, latitude = forward(anchor.x, anchor.y)
        ground = float(next(terrain.sample([(anchor.x,anchor.y)]))[0])
        assert ground != terrain.nodata
        key = 'sanzuwu-sanzuwu-' + number
        fill_id = 'parcel-1006-' + number + '-fill'
        properties = {'kind':'cadastral-fill','parcelKey':key,'parcelNo':number,'sectionName':inputs['sectionName'],
                      'cadastralAreaM2':parcel['registeredAreaM2'],'geometryAreaM2':round(polygon.area,3),
                      'sourceCrs':'EPSG:3826','dxfHandle':parcel['dxfHandle'],'analysisStatus':'awaiting-building-confirmation'}
        geo = transform(forward,polygon)
        pair = [
            {'type':'Feature','id':fill_id,'properties':properties,'geometry':mapping(geo)},
            {'type':'Feature','id':'parcel-1006-'+number+'-boundary','properties':{**properties,'kind':'cadastral-boundary'},
             'geometry':{'type':'LineString','coordinates':list(geo.exterior.coords)}}]
        draft = drafts.get(number)
        if draft:
            assert draft['analysisStatus'] == 'interpreted-draft'
            properties['analysisStatus'] = draft['analysisStatus']
            pair[1]['properties']['analysisStatus'] = draft['analysisStatus']
            selected_features = [f for f in draft_features if f['properties']['parcelNo']==number]
            assert selected_features and all(f['properties']['analysisStatus']=='interpreted-draft' for f in selected_features)
            pair.extend(selected_features)
        features.extend(pair)
        collection = {'type':'FeatureCollection','features':pair}
        for destination in [ROOT/'viewer-source/public/overlays/taoyuan-1006', ROOT/'3d-viewer/overlays/taoyuan-1006']:
            destination.mkdir(parents=True,exist_ok=True)
            (destination/(number+'.geojson')).write_text(json.dumps(collection,ensure_ascii=False,indent=2),encoding='utf-8')
        info = {**inputs['sectionMetadata'],'sectionName':inputs['sectionName'],'sectionCode':inputs['sectionCode'],
                'parcelNo':number,'cadastralAreaM2':parcel['registeredAreaM2'],
                'registrationDate':parcel['registrationDate'],'announcedLandValue':parcel['announcedLandValue'],
                'rightsCategory':parcel['rightsCategory'],'crs':'TWD97 二度 TM（EPSG:3826）／TWVD2001',
                'geometryAreaM2':round(polygon.area,3),
                'analysisNote':'占用範圍尚待確認，暫不提供占用面積與比例。登記面積依提供截圖，與 CAD 幾何面積分開呈現；查詢資料可能有時間落差。'}
        if draft:
            info.update({k:draft[k] for k in ['occupiedAreaM2','occupancyPercent','analysisStatus','analysisVersion','analysisNote']})
            info['targetSummary'] = '；'.join(t['category'] for t in draft['targets'])
            info['reviewImageUrl'] = 'overlays/taoyuan-1006/review/'+number+'-interpreted.png'
            info['analysisReviewNote'] = draft['pending']
        catalog.append({'key':key,'label':inputs['sectionName']+' '+number+' 地號','fillEntityId':fill_id,'info':info,
                        'overlayUrl':'overlays/taoyuan-1006/'+number+'.geojson',
                        'focus':{'longitude':longitude,'latitude':latitude,'height':ground+85,'headingDegrees':0,'pitchDegrees':-90,'rollDegrees':0}})
        audit.append({'parcelNo':number,'dxfHandle':parcel['dxfHandle'],'registeredAreaM2':parcel['registeredAreaM2'],
                      'geometryAreaM2':round(polygon.area,3),'referencePointInside':True,'anchorTwd97':[anchor.x,anchor.y],
                      'demOrthometricHeight':ground,'occupancyStatus':draft['analysisStatus'] if draft else 'awaiting-building-confirmation'})
output=ROOT/'analysis/20261010-taoyuan-1006'
for destination in [output/'parcel-catalog.json',ROOT/'viewer-source/src/taoyuan1006Parcels.json']:
    destination.write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')
(output/'all-parcels.geojson').write_text(json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,indent=2),encoding='utf-8')
(output/'import-audit.json').write_text(json.dumps({'sourceDxf':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
    'sourceCrs':'EPSG:3826','parcelCount':len(catalog),'parcels':audit,'note':inputs['note']},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(audit,ensure_ascii=True,indent=2))

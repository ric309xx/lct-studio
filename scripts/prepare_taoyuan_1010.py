"""Publish verified parcel reference points, never invent boundaries from screenshots.

Re-run only when source inputs/models are unchanged. DXF boundary import and
model-derived occupancy are deliberately separate, pending deliverables.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--packages', required=True)
p.add_argument('--queries', type=Path, required=True)
p.add_argument('--manifests', type=Path, required=True)
a = p.parse_args()
sys.path.insert(0, a.packages)
import rasterio
from pyproj import CRS, Transformer

root = Path(__file__).resolve().parents[1]
queries = json.loads(a.queries.read_text(encoding='utf8'))
rows = queries['parcels']
first = dict(parcelNo='17-1', block=0, inputLongitude=121.212610,
             inputLatitude=24.975683, registeredAreaM2=2857,
             twd97E=271465.061, twd97N=2763100.996,
             registrationDateAsDisplayed='民國052年04月10日',
             announcedLandValueTwdPerM2=18000, rightsCategoryAsDisplayed='省市:100.00%',
             administrativeAreaAsDisplayed='桃園市中壢區三民里',
             source='使用者提供的17-1基本／土地／地段資訊三張截圖')
rows = [first, *rows]
version = '20261019-1010-model-reference-v1'
note = '模型已匯入；目前僅有地號資訊與查詢定位點，尚缺地籍向量界線。定位點不是土地邊界，未繪製紅色地籍面或綠色占用範圍，未計算占用面積；未分析不代表零占用。'
catalog, features, audit = [], {}, []
fwd = Transformer.from_crs(4326, 3826, always_xy=True)
for row in rows:
    model_id = '1010-cl1' if row['block'] == 0 else '1010-cl2'
    model = Path(r'D:\DJI\DJITerra\20261006CL') / ('20261010CL1' if model_id.endswith('cl1') else '20261010CL2') / 'models/pc/0'
    lon, lat = row['inputLongitude'], row['inputLatitude']
    x, y = fwd.transform(lon, lat)
    with rasterio.open(model / 'terra_dem/dem.tif') as dem:
        crs = CRS(dem.crs)
        horizontal = crs.sub_crs_list[0] if crs.is_compound else crs
        assert horizontal.to_epsg() == 3826
        assert dem.bounds.left < x < dem.bounds.right and dem.bounds.bottom < y < dem.bounds.top
        z = float(next(dem.sample([(x, y)]))[0])
        assert z != dem.nodata and 0 < z < 1000
    no = row['parcelNo']
    key = 'sanzuwu-jiushe-' + no
    group = model_id + ('-01' if row['block'] <= 1 else '-02')
    url = 'overlays/taoyuan-1010-v1/' + group + '.geojson'
    info = dict(county='桃園市', landOffice='中壢', sectionName='三座屋段舊社小段',
                sectionCode='0205', sectionExtensionCode='0', townCode='03',
                surveyMethod='圖解法', surveyType='修正測量', mapDate='1959-09',
                coordinateSystem='地籍坐標（原始成圖）', crs='定位點 WGS84；模型 EPSG:3826／TWVD2001；地籍向量尚缺',
                scale='1:600', digitizedDate='2002-11', useZone='—', landUseCategory='—',
                parcelNo=no, cadastralAreaM2=row['registeredAreaM2'],
                registrationDate=row['registrationDateAsDisplayed'],
                announcedLandValue=f"{row['announcedLandValueTwdPerM2']:,} 元／平方公尺",
                rightsCategory=row['rightsCategoryAsDisplayed'],
                analysisStatus='awaiting-cadastral-boundary', analysisVersion=version, analysisNote=note)
    catalog.append(dict(key=key, label='三座屋段舊社小段 ' + no + ' 地號',
                        groupKey=group, groupLabel='舊社小段｜' + no,
                        fillEntityId='reference-' + key, boundaryStatus='missing', info=info,
                        overlayUrl=url, tilesetPath=model_id + '/tileset.json',
                        focus=dict(longitude=lon, latitude=lat, height=z + 100,
                                   headingDegrees=0, pitchDegrees=-65, rollDegrees=0)))
    features.setdefault(url, []).append(dict(type='Feature', id='reference-' + key,
        properties=dict(kind='cadastral-reference', parcelKey=key, parcelNo=no, groupKey=group,
                        source='NLSC point query / supplied screenshot', boundaryStatus='missing'),
        geometry=dict(type='Point', coordinates=[lon, lat])))
    audit.append(dict(parcelNo=no, model=model_id, group=group, sourcePointWgs84=[lon, lat],
                      transformedPointTwd97=[x, y], anchorSourceDemHeight=z,
                      queryPointTwd97AsDisplayed=[row['twd97E'], row['twd97N']],
                      administrativeAreaAsDisplayed=row['administrativeAreaAsDisplayed'],
                      registeredAreaM2=row['registeredAreaM2'], boundaryAvailable=False,
                      occupancyComputed=False))

def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

write(root / 'viewer-source/src/taoyuan1010Parcels.json', catalog)
for url, ff in features.items():
    for base in ['viewer-source/public', '3d-viewer']:
        write(root / base / url, dict(type='FeatureCollection', features=ff))
models = []
for source_id in ['cl1', 'cl2']:
    m = json.loads((a.manifests / f'1010-{source_id}-v1-manifest.json').read_text(encoding='utf8'))
    assert not m['unreachable'] and m['objectCount'] == len(m['objects'])
    models.append(dict(model='1010-' + source_id, source=m['root'], objects=m['objectCount'],
                       bytes=m['bytes'], jsonCount=m['jsonCount'],
                       rootSha256=next(o['sha256'] for o in m['objects'] if o['relative'] == 'tileset.json'),
                       r2Prefix=f'projects/taoyuan/20261010-{source_id}-v1/terra_b3dms/'))
write(root / 'analysis/20261019-taoyuan-1010/import-audit.json', dict(version=version,
      scope='1010CL1 17-1；1010CL2 179-71及255系列四筆；既有地號不改動',
      sourceQuerySha256=hashlib.sha256(a.queries.read_bytes()).hexdigest(),
      source17Screenshots=[dict(file=f.name, sha256=hashlib.sha256(f.read_bytes()).hexdigest())
          for f in sorted(Path(r'D:\DATA\WORK\20261006桃園三維地籍\地籍資料\03_1010\01\中壢所 (HB0205-0)三座屋段舊社小段 17-1地號').glob('*.jpg'))],
      note=note, cadastralDxfAvailable=False, parcels=audit, models=models,
      modelCrs='EPSG:3826+8904',
      quality={'cl1': {'inputImages':852,'calibratedImages':830,'controlPointRmseM':[.010740,.011946,.010427]},
               'cl2': {'inputImages':932,'calibratedImages':932,'controlPointRmseM':[.007202,.012686,.024620]},
               'note':'GCP fitting residuals are not independent cadastral accuracy. No boundary comparison performed.'}))
print(json.dumps(dict(parcels=len(catalog), groups=len(features), models=models), ensure_ascii=False))

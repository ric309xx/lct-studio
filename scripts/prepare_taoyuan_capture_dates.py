"""Capture dates come from image records in Taipei time, never folder dates."""
import argparse,json,hashlib,datetime,re,sys
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--packages',required=True);a=p.parse_args();sys.path.insert(0,a.packages)
from PIL import Image
root=Path(__file__).resolve().parents[1];base=Path(r'D:\DJI\DJITerra\20261006CL');tz=datetime.timezone(datetime.timedelta(hours=8))
models={'tileset.json':'20261006CL','1010-cl1/tileset.json':'20261010CL1','1010-cl2/tileset.json':'20261010CL2','1013/tileset.json':'20261013CL','1013-v2/tileset.json':'20261013CL','1013-cl2/tileset.json':'20261013CL2','1015-cl1/tileset.json':'20261015CL1','1015-cl2/tileset.json':'20261015CL2'}
result={};audit=[]
for tileset,folder in models.items():
 source=base/folder/'images/survey/original_image_list.json';rows=json.loads(source.read_text(encoding='utf8'))
 stamps=[datetime.datetime.fromtimestamp(r['capture_time'],tz) for r in rows if r.get('capture_time')];assert len(stamps)==len(rows)
 dates=sorted(set(d.date().isoformat() for d in stamps));mismatches=0
 for row,stamp in zip(rows,stamps):
  match=re.search(r'DJI_(\d{8})(\d{6})_',Path(row['origin_path']).name)
  if match and match[1]!=stamp.strftime('%Y%m%d'):mismatches+=1
 assert mismatches==0,(folder,'image timestamp versus image-name date mismatch')
 exif_verified=0
 for i in sorted(set([0,len(rows)//2,len(rows)-1])):
  path=Path(rows[i]['origin_path'])
  if not path.is_file():continue
  with Image.open(path) as image:value=image.getexif().get_ifd(34665).get(36867)
  if value:
   assert datetime.datetime.strptime(value,'%Y:%m:%d %H:%M:%S').date()==stamps[i].date()
   exif_verified+=1
 result[tileset]=dict(startDate=dates[0],endDate=dates[-1],timezone='Asia/Taipei',imageCount=len(rows),source='Terra影像拍攝紀錄',exifSamplesVerified=exif_verified)
 audit.append(dict(tilesetPath=tileset,sourceRecord=str(source),sourceRecordSha256=hashlib.sha256(source.read_bytes()).hexdigest(),firstCaptureTaipei=min(stamps).isoformat(),lastCaptureTaipei=max(stamps).isoformat(),dateCounts={date:sum(s.date().isoformat()==date for s in stamps) for date in dates},exifSamplesVerified=exif_verified,fileNameDateMismatches=mismatches))
(root/'viewer-source/src/caseCaptureDates.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(root/'analysis/20261019-taoyuan-1010/capture-date-audit.json').write_text(json.dumps(dict(timezone='Asia/Taipei',folderNamesNotUsedAsDate=True,models=audit),ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(result,ensure_ascii=False,indent=2))

"""Read original workbooks without editing them; keep all private output in .local/."""
import argparse, collections, hashlib, json, pathlib, shutil
import openpyxl

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('directory'); args=ap.parse_args()
    source=pathlib.Path(args.directory); target=pathlib.Path(__file__).resolve().parents[1]/'.local'/'imports'; target.mkdir(parents=True,exist_ok=True)
    batches=[]
    for filename,kind in [('中壢八德坐標成果表.xlsx','zhongli-bade'),('109一等水準點清冊(公告).xlsx','leveling-109')]:
        path=source/filename; digest=hashlib.sha256(path.read_bytes()).hexdigest(); dest=target/(digest+'.xlsx')
        if not dest.exists(): shutil.copy2(path,dest)
        wb=openpyxl.load_workbook(path,read_only=True,data_only=True); records=[]
        if kind=='zhongli-bade':
            extra={(str(r[0]),round(r[1],3),round(r[2],3),round(r[3],3)):(r[4],r[5]) for r in wb['座標'].iter_rows(min_row=2,values_only=True)}
            sheet='中壢八德坐標成果表'
            for i,row in enumerate(wb[sheet].iter_rows(min_row=2,values_only=True),2):
                a,b,c,d,e,f,g,h=row[:8]; lonlat=extra.get((str(a),round(b,3),round(c,3),round(d,3)))
                record=dict(code=str(e),original_code=str(a),north=b,east=c,height=d,category=f or '',description=g or '',notes=h or '',source_row=i,source_sheet=sheet,raw=dict(zip(['點號','縱坐標(N)','橫坐標(E)','橢球高','計算點號','備註','說明','未命名欄'],row[:8])))
                if lonlat: record.update(source_lon=lonlat[0],source_lat=lonlat[1])
                records.append(record)
            metadata={'originalNameDuplicateGroups':sum(v>1 for v in collections.Counter(r['original_code'] for r in records).values()),'matchedWgs84Rows':len(extra),'heightNote':'來源明確標示橢球高；未標示高程基準與坐標年代。'}
            name='中壢八德'; height_type='橢球高'
        else:
            sheet='公告成果'; header=[c.value for c in next(wb[sheet].iter_rows())]
            mainrows=list(wb[sheet].iter_rows(min_row=2,values_only=True))
            subset=list(wb['工作表1'].iter_rows(min_row=2,values_only=True))
            mainset={tuple(r) for r in mainrows}
            if any(tuple(r) not in mainset for r in subset): raise ValueError('工作表1 含主表以外紀錄，需人工檢查')
            for i,row in enumerate(mainrows,2):
                r=dict(zip(header,row)); records.append(dict(code=str(r['點號']),original_code=str(r['點號']),name=r['點名'] or '',north=r['縱坐標'],east=r['橫坐標'],height=r['高程'],category=r['等級'] or '',description=r['所在地'] or '',notes=str(r['備註'] or ''),source_row=i,source_sheet=sheet,raw=r))
            metadata={'excludedSubsetRows':len(subset),'heightNote':'來源標示高程，未註明垂直基準；不視為橢球高。'}
            name='109 年一等水準點'; height_type='高程（基準待確認）'
        wb.close()
        assert len(records)==len({r['code'] for r in records}), '計算點號不唯一'
        batch={'dataset':{'id':kind,'name':name,'crs':'TWD97 / TM2 121 分帶','epsg':3826,'height_type':height_type,'height_datum':None,'source_name':filename,'source_hash':digest,'metadata':{**metadata,'crsConfirmedBy':'使用者確認 TWD97；121 分帶依點位所在區域及既有經緯度驗證'}},'records':records,'file':str(dest)}
        batches.append(batch)
        print(json.dumps({'dataset':name,'count':len(records),'metadata':metadata},ensure_ascii=False))
    (target/'batches.json').write_text(json.dumps(batches,ensure_ascii=False,default=str),encoding='utf-8')

if __name__=='__main__': main()

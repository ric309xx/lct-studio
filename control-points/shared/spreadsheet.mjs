import * as XLSX from 'xlsx';

// Column positions keep repeated/unnamed Excel headers from overwriting data.
export function worksheetColumns(sheet) {
  if (!sheet?.['!ref']) return [];
  const range=XLSX.utils.decode_range(sheet['!ref']);
  const columns=Array.from({length:range.e.c-range.s.c+1},(_,i)=>{
    const index=range.s.c+i,letter=XLSX.utils.encode_col(index);
    const header=String(sheet[XLSX.utils.encode_cell({r:range.s.r,c:index})]?.v??'').replace(/\s+/g,' ').trim();
    return {key:String(index),letter,header,label:header||`欄 ${letter}`};
  });
  return columns.map(c=>({...c,label:c.header&&columns.filter(x=>x.header===c.header).length>1?`${c.header}（${c.letter} 欄）`:c.label}));
}

export function worksheetRecords(sheet,sheetName,mapping) {
  if (!sheet?.['!ref']) return [];
  const range=XLSX.utils.decode_range(sheet['!ref']),columns=worksheetColumns(sheet),records=[];
  for(let row=range.s.r+1;row<=range.e.r;row++) {
    const cell=c=>sheet[XLSX.utils.encode_cell({r:row,c:Number(c)})];
    if(!columns.some(c=>cell(c.key)?.v!=null&&cell(c.key).v!=='')) continue;
    const raw={},display={},formulas={};
    for(const c of columns) {
      const source=cell(c.key);
      raw[c.label]=source?.v??'';
      if(source?.v!=null) display[c.label]=String(source.w??XLSX.utils.format_cell(source)).trim();
      if(source?.f) formulas[c.label]=source.f;
    }
    raw.__excel={display,formulas};
    /** @type {Record<string, any>} */
    const record={source_row:row+1,source_sheet:sheetName,raw};
    for(const [field,column] of Object.entries(mapping)) record[field]=column!==''&&column!=null?cell(column)?.v??'':field==='height'?null:'';
    if(!record.original_code) record.original_code=record.code;
    records.push(record);
  }
  return records;
}

import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {basename} from 'node:path';
import {normalizeRecords} from '../shared/coordinates.mjs';
import {login,api} from './client.mjs';
const batches=JSON.parse(readFileSync(new URL('../.local/imports/batches.json',import.meta.url),'utf8'));
const prepared=batches.map(b=>({...b,validation:normalizeRecords(b.records,b.dataset)}));
for(const b of prepared)if(b.validation.errors.length)throw new Error(JSON.stringify({dataset:b.dataset.name,errors:b.validation.errors}));
const cookie=await login(),report=[];
for(const b of prepared){
  const form=new FormData();form.set('payload',JSON.stringify({dataset:b.dataset,records:b.records}));form.set('source',new File([readFileSync(b.file)],b.dataset.source_name));
  const result=await(await api('/api/import',cookie,{method:'POST',body:form})).json();
  report.push({dataset:b.dataset.name,source:b.dataset.source_name,rows:b.records.length,...result});
  console.log(JSON.stringify(report.at(-1)));
}
mkdirSync(new URL('../.local/',import.meta.url),{recursive:true});writeFileSync(new URL('../.local/import-report.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),report},null,2));

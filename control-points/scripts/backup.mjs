import {readBackup} from '../shared/pages.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import JSZip from 'jszip';
import {login,api} from './client.mjs';
const cookie=await login(),zip=new JSZip(),data=await readBackup(async path=>(await api(path,cookie)).json());
zip.file('data.json',JSON.stringify(data,null,2));
for(const d of data.datasets)zip.file('sources/'+d.id+'/'+d.source_name,new Uint8Array(await(await api(`/api/datasets/${encodeURIComponent(d.id)}/source`,cookie)).arrayBuffer()));
for(const a of data.attachments){zip.file('photos/'+a.id+'/'+a.filename,new Uint8Array(await(await api(`/api/backup-files/${a.id}`,cookie)).arrayBuffer()));if(a.thumb_key)zip.file('photos/'+a.id+'/thumbnail.jpg',new Uint8Array(await(await api(`/api/backup-files/${a.id}/thumbnail`,cookie)).arrayBuffer()));}
const overlay=await(await api('/api/overlay',cookie)).json();if(overlay)zip.file('cadastral.geojson',JSON.stringify(overlay));
for(const r of data.references||[]){for(const [file,path] of [['source.dxf',`/api/references/${r.id}/source`],['data.geojson',`/api/references/${r.id}`]])zip.file(`references/${r.id}/${file}`,new Uint8Array(await(await api(path,cookie)).arrayBuffer()));}
const stamp=new Date().toISOString().replaceAll(':','-'),dir=new URL('../.local/backups/',import.meta.url);mkdirSync(dir,{recursive:true});
writeFileSync(new URL(`backup-${stamp}.zip`,dir),await zip.generateAsync({type:'nodebuffer'}));console.log(`完整備份完成：${data.points.length} 點、${data.attachments.length} 個附件，保存於 .local/backups/`);

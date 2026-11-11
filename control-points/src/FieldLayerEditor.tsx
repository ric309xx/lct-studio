import {useEffect,useState} from 'react';
import {api,jsonRequest} from './api';
import {datasetMetadata} from '../shared/datasets.mjs';
import type {Dataset} from './types';
export default function FieldLayerEditor({dataset,online,onSaved,onClose}:{dataset:Dataset;online:boolean;onSaved:()=>Promise<void>;onClose:()=>void}){
 const [orig,S]=useState<Dataset|null>(null),[name,N]=useState(''),[year,Y]=useState(115),[color,C]=useState('#468767'),[error,E]=useState(''),[busy,B]=useState(false),[retry,R]=useState(0);
 useEffect(()=>{let alive=true;E('');api<Dataset>('/api/field-datasets/'+dataset.id).then(d=>{if(alive){const m=datasetMetadata(d);S(d);N(d.name);Y(m.resultYear);C(m.color);}}).catch(e=>{if(alive)E(e.message);});return()=>{alive=false;};},[dataset.id,retry]);
 async function save(e:React.FormEvent){e.preventDefault();if(!orig||busy)return;B(true);try{await api('/api/field-datasets/'+dataset.id,jsonRequest('PATCH',{name,resultYear:year,color,expectedName:orig.name,expectedMetadata:orig.metadata}));await onSaved();onClose();}catch(e){E((e as Error).message);}finally{B(false);}}
 return <div className="modal-backdrop field-layer-editor"><form className="modal" onSubmit={save} aria-label="修改圖層"><div className="modal-heading"><h2>修改圖層</h2><button type="button" aria-label="關閉修改圖層" onClick={onClose} disabled={busy}>關閉</button></div><p>名稱、年份與顏色會同步套用到清單及地圖。</p><label>圖層名稱<input required maxLength={100} value={name} onChange={e=>N(e.target.value)}/></label><div className="form-grid"><label>成果年（民國）<input type="number" min="1" max="300" required value={year} onChange={e=>Y(Number(e.target.value))}/></label><label>顏色<input type="color" value={color} onChange={e=>C(e.target.value)}/></label></div>{error&&<p role="alert">{error}</p>}{!orig&&error&&<button type="button" onClick={()=>R(r=>r+1)}>重試載入圖層</button>}<button className="primary full" disabled={!online||!orig||busy}>保存圖層設定</button></form></div>;
}

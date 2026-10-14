import {useState} from 'react';import {Pencil} from 'lucide-react';
import {VISIT_STATUSES,displayPointStatus} from '../shared/fieldWorkflow.mjs';
import {api,jsonRequest} from './api';import type {Visit} from './types';
export default function VisitEditor({visit,online,onSaved}:{visit:Visit;online:boolean;onSaved:()=>void}){
  const [open,setOpen]=useState(false),[status,setStatus]=useState(visit.status),[note,setNote]=useState(visit.note),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function save(){setBusy(true);setError('');try{await api(`/api/points/${visit.point_id}/visits/${visit.id}`,jsonRequest('PATCH',{status,note,expectedStatus:visit.status,expectedNote:visit.note}));setOpen(false);onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <div className="visit-editor">{open?<><label>修改巡查點況<select value={status} onChange={e=>setStatus(e.target.value)}>{VISIT_STATUSES.map(s=><option key={s} value={s}>{displayPointStatus(s)}</option>)}</select></label><label>修改巡查內容<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={8000} rows={3}/></label>{error&&<p className="error-text" role="alert">{error}</p>}<div className="button-row"><button className="primary" disabled={busy} onClick={save}>保存修改</button><button className="secondary" disabled={busy} onClick={()=>setOpen(false)}>取消</button></div></>:<button className="text-button" disabled={!online} onClick={()=>{setStatus(visit.status);setNote(visit.note);setError('');setOpen(true);}}><Pencil size={13}/>修改此筆巡查</button>}</div>;
}

import {createLoginProof} from '../shared/loginProof.mjs';
import {queueDelete,queueList,queuePut} from './storage';
import type {QueueItem} from './types';
export class ApiError extends Error {constructor(message:string,public status:number){super(message);}}
export async function api<T=any>(url:string,options:RequestInit={}):Promise<T>{
  const response=await fetch(url,{...options,credentials:'same-origin',cache:'no-store'});
  if(!response.ok){let data:any;try{data=await response.json();}catch{};throw new ApiError(data?.error||`請求失敗（${response.status}）`,response.status);}
  return response.json();
}
export const jsonRequest=(method:string,data:unknown):RequestInit=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
let syncing:Promise<void>|null=null;
export function syncQueue(onChange:()=>void):Promise<void>{
  if(syncing)return syncing;
  syncing=(async()=>{
    const items=(await queueList()).sort((a,b)=>(a.kind==='visit'?0:1)-(b.kind==='visit'?0:1)||a.createdAt.localeCompare(b.createdAt));
    for(const item of items){
      try{
        if(item.kind==='visit')await api(`/api/points/${item.pointId}/visits`,jsonRequest('POST',item.payload));
        else{
          const form=new FormData();form.set('file',item.file!,item.filename!);if(item.thumbnail)form.set('thumbnail',item.thumbnail,'thumbnail.jpg');
          for(const [key,value] of Object.entries(item.payload))if(value!=null)form.set(key,typeof value==='object'?JSON.stringify(value):String(value));
          await api(`/api/points/${item.pointId}/attachments`,{method:'POST',body:form});
        }
        await queueDelete(item.id);onChange();
      }catch(error){await queuePut({...item,error:error instanceof Error?error.message:'上傳失敗'});onChange();if(error instanceof ApiError&&error.status===401)throw error;if(error instanceof TypeError)break;}
    }
  })().finally(()=>{syncing=null;});return syncing;
}
export async function makeThumbnail(file:Blob):Promise<Blob|undefined>{
  if(!file.type.startsWith('image/')&&!/heic|heif/i.test((file as File).name||''))return;
  let url='';
  try{url=URL.createObjectURL(file);const image=new Image();image.src=url;await image.decode();const scale=Math.min(1,1000/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);return await new Promise(resolve=>canvas.toBlob(b=>resolve(b||undefined),'image/jpeg',.82));}
  catch{return;}finally{if(url)URL.revokeObjectURL(url);}
}

export async function loginWithPassword(password:string){const challenge=await api('/api/login/challenge',{method:'POST'});return api('/api/login',jsonRequest('POST',await createLoginProof(password,challenge)));}

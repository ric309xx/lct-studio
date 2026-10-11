import type {QueueItem} from './types';
const dbPromise=new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('lct-control-points-v1',1);
  request.onupgradeneeded=()=>{request.result.createObjectStore('kv');request.result.createObjectStore('queue',{keyPath:'id'});};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
async function tx<T>(store:string,mode:IDBTransactionMode,action:(s:IDBObjectStore)=>IDBRequest):Promise<T>{
  const db=await dbPromise;return new Promise((resolve,reject)=>{const transaction=db.transaction(store,mode),r=action(transaction.objectStore(store));let result:T;r.onsuccess=()=>{result=r.result;};transaction.oncomplete=()=>resolve(result);transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});
}
export const readStored=<T,>(key:string)=>tx<T|undefined>('kv','readonly',s=>s.get(key));
export const storeValue=(key:string,value:unknown)=>tx('kv','readwrite',s=>s.put(value,key));
export const deleteStored=(key:string)=>tx('kv','readwrite',s=>s.delete(key));
export const queueList=()=>tx<QueueItem[]>('queue','readonly',s=>s.getAll());
export const queuePut=(item:QueueItem)=>tx('queue','readwrite',s=>s.put(item));
export const queueDelete=(id:string)=>tx('queue','readwrite',s=>s.delete(id));
export async function clearOffline(){const db=await dbPromise;return new Promise<void>((resolve,reject)=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').clear();t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});}

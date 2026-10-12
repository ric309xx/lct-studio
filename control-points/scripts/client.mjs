import {createLoginProof} from '../shared/loginProof.mjs';
export const base=process.env.LCT_BASE_URL||'http://127.0.0.1:8789';
export async function login(){
  if(!process.env.LCT_INITIAL_PASSWORD)throw new Error('請以 LCT_INITIAL_PASSWORD 環境變數提供登入密碼');
  const challenge=await fetch(base+'/api/login/challenge',{method:'POST'});if(!challenge.ok)throw new Error(`登入驗證失敗 ${challenge.status}`);
  const proof=await createLoginProof(process.env.LCT_INITIAL_PASSWORD,await challenge.json());
  const r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(proof)});
  if(!r.ok)throw new Error(`登入失敗 ${r.status}`);
  return r.headers.get('set-cookie').split(';')[0];
}
export async function api(path,cookie,options={}){
  const r=await fetch(base+path,{...options,headers:{Cookie:cookie,...options.headers}});
  if(!r.ok)throw new Error(`${path}: ${r.status} ${await r.text()}`);return r;
}

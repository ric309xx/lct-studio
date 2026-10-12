import {LOGIN_ITERATIONS,signLoginChallenge} from '../shared/loginProof.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);return v===0;};
export async function loginRoute(req,env){
  if(!env.PASSWORD_HASH||!env.PASSWORD_SALT)fail('登入服務尚未設定',503);
  const ip=await hash(req.headers.get('cf-connecting-ip')||'local'),time=Math.floor(Date.now()/1000),db=env.DB;
  const attempt=await db.prepare('SELECT * FROM login_attempts WHERE ip_hash=?').bind(ip).first();
  if(attempt&&attempt.reset_at>time&&attempt.attempts>=8)fail('登入失敗次數過多，請於 15 分鐘後重試',429);
  if(new URL(req.url).pathname==='/api/login/challenge'){
    // One short-lived challenge per IP bounds storage and invalidates previous attempts.
    const challenge=crypto.randomUUID()+crypto.randomUUID();
    await db.prepare('INSERT INTO login_challenges(ip_hash,challenge,expires) VALUES(?,?,?) ON CONFLICT(ip_hash) DO UPDATE SET challenge=excluded.challenge,expires=excluded.expires').bind(ip,challenge,time+120).run();
    await db.prepare('DELETE FROM login_challenges WHERE expires<?').bind(time).run();
    return json({challenge,salt:env.PASSWORD_SALT,iterations:LOGIN_ITERATIONS});
  }
  const body=await req.text();if(body.length>4096)fail('登入資料過大',413);
  let data;try{data=JSON.parse(body);}catch{fail('登入資料格式錯誤');}
  if(typeof data?.password==='string')fail('登入頁面已更新，請重新整理後再試',409);
  if(typeof data?.challenge!=='string'||data.challenge.length!==72||typeof data.proof!=='string'||!/^[a-f0-9]{64}$/.test(data.proof))fail('登入資料格式錯誤');
  // DELETE RETURNING consumes the challenge atomically, including failed attempts.
  const challenge=await db.prepare('DELETE FROM login_challenges WHERE ip_hash=? AND challenge=? AND expires>? RETURNING challenge').bind(ip,data.challenge,time).first();
  const key=Uint8Array.from(env.PASSWORD_HASH.match(/.{2}/g)||[],b=>parseInt(b,16));
  if(!challenge||!equal(await signLoginChallenge(key,data.challenge),data.proof)){
    await db.prepare('INSERT INTO login_attempts VALUES(?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN reset_at>? THEN attempts+1 ELSE 1 END,reset_at=CASE WHEN reset_at>? THEN reset_at ELSE ? END').bind(ip,time+900,time,time,time+900).run();
    fail('密碼不正確或登入驗證已過期，請重試',401);
  }
  const token=crypto.randomUUID()+crypto.randomUUID(),ttl=12*3600;
  await db.batch([db.prepare('DELETE FROM login_attempts WHERE ip_hash=?').bind(ip),db.prepare('INSERT INTO sessions VALUES(?,?)').bind(await hash(token),time+ttl),db.prepare('DELETE FROM sessions WHERE expires<?').bind(time)]);
  return new Response('{"ok":true}',{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':`lct_points_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ttl}${new URL(req.url).protocol==='https:'?'; Secure':''}`}});
}

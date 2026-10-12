export const LOGIN_ITERATIONS=100000;
const encode=value=>new TextEncoder().encode(value);
export async function signLoginChallenge(keyBytes,challenge){
  const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encode('lct-control-points:login:v1:'+challenge)))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function createLoginProof(password,challenge){
  if(challenge?.iterations!==LOGIN_ITERATIONS||typeof challenge.salt!=='string'||typeof challenge.challenge!=='string')throw new Error('登入服務版本不符，請重新整理');
  const key=await crypto.subtle.importKey('raw',encode(password),'PBKDF2',false,['deriveBits']);
  const derived=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encode(challenge.salt),iterations:LOGIN_ITERATIONS},key,256);
  return {challenge:challenge.challenge,proof:await signLoginChallenge(derived,challenge.challenge)};
}

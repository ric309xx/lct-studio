import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomBytes,pbkdf2Sync} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
mkdirSync('.local',{recursive:true});
if(!existsSync('.dev.vars')){
  const password=process.env.LCT_INITIAL_PASSWORD;
  if(!password)throw new Error('首次設定請以 LCT_INITIAL_PASSWORD 環境變數提供密碼。密碼只保存為雜湊，不寫進程式。');
  const salt=randomBytes(24).toString('hex'),hash=pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex');
  writeFileSync('.dev.vars',`PASSWORD_SALT="${salt}"\nPASSWORD_HASH="${hash}"\n`,{flag:'wx'});
}
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','control-points','--local','--file','schema.sql'],{stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
if(result.status!==0)process.exit(result.status||1);
writeFileSync('.local/setup-complete.json',JSON.stringify({ready:true,at:new Date().toISOString()}));
console.log('本機資料庫已設定；未連線或部署遠端 D1/R2。');

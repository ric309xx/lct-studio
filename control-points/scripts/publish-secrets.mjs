// Upload the already configured password hash, never the plaintext password.
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const local=readFileSync('.dev.vars','utf8'),secrets={};
for(const key of ['PASSWORD_SALT','PASSWORD_HASH']){
  const value=local.match(new RegExp('^'+key+'="([a-f0-9]+)"','m'))?.[1];
  if(!value)throw new Error('缺少本機密碼設定：'+key);secrets[key]=value;
}
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','secret','bulk','--config','wrangler.production.jsonc'],{input:JSON.stringify(secrets),stdio:['pipe','inherit','inherit'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
process.exit(result.status??1);

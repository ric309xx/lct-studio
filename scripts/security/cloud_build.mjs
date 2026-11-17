// 僅在 Netlify 雲端執行，避免在本機啟動被防毒攔下的原生建置工具。
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'../..');
if(process.env.NETLIFY!=='true')throw Error('此流程只允許在 Netlify 雲端執行');
await import('./check_source_base.mjs');if(process.exitCode)process.exit(process.exitCode);
const env={...process.env,LCT_PROJECT_ROOT:root,VITE_LOCAL_HEIGHT_AUDIT:'0'};
const run=(command,args,cwd=root)=>{
  const r=spawnSync(command,args,{cwd,env,stdio:'inherit',windowsHide:true});
  if(r.error||r.status!==0)process.exit(r.status??1);
};
// 沿用現有 lockfile 與依賴，不改變前端套件版本。
run('corepack',['prepare','pnpm@10.14.0','--activate']);
run('corepack',['pnpm','install','--frozen-lockfile'],path.join(root,'viewer-source'));
const tests=['scripts/security','workers/private-3d-viewer/test'].flatMap(dir=>fs.readdirSync(path.join(root,dir)).filter(x=>x.endsWith('.test.mjs')).map(x=>path.join(dir,x)));
run(process.execPath,[path.join(root,'scripts/build_public_site.mjs')]);
run(process.execPath,['--test',...tests]);
run(process.execPath,['node_modules/vitest/vitest.mjs','run','--maxWorkers=2'],path.join(root,'viewer-source'));
run(process.execPath,[path.join(root,'scripts/build_viewer.mjs')]);
await import('./build_and_audit.mjs');

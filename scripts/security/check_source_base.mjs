// 防止較舊的本機原始碼覆蓋正式站的新功能；只讀取 Git，不修改工作目錄。
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'../..');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'docs/security-source-baseline.json'),'utf8'));
const result=spawnSync('git',['merge-base','--is-ancestor',baseline.productionCommit,'HEAD'],{cwd:root,encoding:'utf8',windowsHide:true});
const issues=[];
if(result.status!==0)issues.push('正式站最新提交尚未整合到目前版本');
for(const file of baseline.requiredViewerFiles)if(!fs.existsSync(path.join(root,file)))issues.push('缺少正式站功能原始檔：'+file);
const preview=process.env.NETLIFY==='true'&&['branch-deploy','deploy-preview'].includes(process.env.CONTEXT);
if(!baseline.integrationVerified&&!preview)issues.push('正式版本功能保留與重新建置尚未驗收');
console.log(JSON.stringify({sourceReady:issues.length===0,requiredProductionCommit:baseline.productionCommit,issues},null,2));
if(issues.length)process.exitCode=1;

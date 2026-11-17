import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {checkReleaseConfig} from '../../netlify/lib/release-config.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const file=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'.local/security-release-20261118/netlify-secrets.json');
let settings;try{settings=JSON.parse(fs.readFileSync(file,'utf8'));}catch{console.log(JSON.stringify({ready:false,issues:['release-settings-unavailable']}));process.exitCode=1;}
if(settings){
 const report=checkReleaseConfig(settings);
 const previous=path.join(root,'.local/security-migration/netlify-secrets.json');
 if(fs.existsSync(previous)){
   const old=JSON.parse(fs.readFileSync(previous,'utf8'));
   const digest=value=>createHash('sha256').update(value??'').digest('hex');
   if(digest(old.CESIUM_ION_ACCESS_TOKEN)===digest(settings.CESIUM_ION_ACCESS_TOKEN))report.issues.push('CESIUM_ION_ACCESS_TOKEN:previously-exposed');
 }
 report.ready=report.issues.length===0;
 console.log(JSON.stringify(report));if(!report.ready)process.exitCode=1;
}

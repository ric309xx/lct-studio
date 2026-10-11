import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export default defineConfig({plugins:[react(),{name:'offline-shell',closeBundle(){
  const assets=readdirSync('dist/assets').map(name=>'/assets/'+name);
  const version=createHash('sha256').update(assets.join('|')).digest('hex').slice(0,12);
  const sw=readFileSync('public/sw.js','utf8').replace('__BUILD__',version).replace('/*__ASSETS__*/',assets.map(a=>JSON.stringify(a)).join(','));
  writeFileSync('dist/sw.js',sw);
}}], build:{outDir:'dist'}});

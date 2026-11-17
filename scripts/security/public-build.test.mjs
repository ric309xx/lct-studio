import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
test('公開產物不包含伺服器、專案原始碼或工作文件',()=>{
  const out=path.join(root,'.site-dist');assert.ok(fs.existsSync(out));
  for(const file of ['workers','netlify','viewer-source','control-points','scripts','PROJECT_LOG.md','.local','.env','index-LAPTOP-LCT-F16.html'])assert.equal(fs.existsSync(path.join(out,file)),false,file);
  assert.equal(fs.existsSync(path.join(out,'3d-viewer/overlays/taoyuan-building-overlay.geojson')),false);
  assert.equal(fs.existsSync(path.join(out,'3d-viewer/overlays/taoyuan-1006')),false);
  for(const file of ['index.html','archive/index.html','3d-viewer/assets/viewer.js','robots.txt','sitemap.xml','_headers'])assert.ok(fs.existsSync(path.join(out,file)),file);
  const headers=fs.readFileSync(path.join(out,'_headers'),'utf8');assert.match(headers,/frame-ancestors 'none'/);
});
test('管理員與既有後端登入分享頁不再公開密碼雜湊；分享頁設定仍可解析',()=>{
  const pages=['3d-viewer/index.html',...fs.readdirSync(path.join(root,'3d-viewer/p')).map(x=>'3d-viewer/p/'+x+'/index.html').filter(x=>fs.existsSync(path.join(root,x)))];
  for(const file of pages){
    const html=fs.readFileSync(path.join(root,file),'utf8');const config=html.match(/window\.LCT_VIEWER_ACCESS\s*=\s*({[\s\S]*?});/);
    assert.ok(config,file);const parsed=vm.runInNewContext('('+config[1]+')');
    assert.equal(parsed.passwordHash,undefined,file);
    assert.deepEqual(Object.keys(parsed).sort(),['accessId','role']);
    assert.match(html,/noindex/);
  }
});
test('部署用 bundle 與原始碼皆已移除前端密碼提權分支',()=>{
  for(const file of ['viewer-source/src/App.tsx','3d-viewer/assets/viewer.js']) {
    const text=fs.readFileSync(path.join(root,file),'utf8');assert.doesNotMatch(text,/管理員密碼不正確/);
    assert.match(text,/LCT_VIEWER_BOOTSTRAP/);
  }
});
test('典藏頁只導向分享入口',()=>{
  const text=fs.readFileSync(path.join(root,'archive/archive.js'),'utf8');
  assert.doesNotMatch(text,/3d-viewer\/\?project=/);assert.match(text,/3d-viewer\/p\//);
});

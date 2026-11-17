import {describe,it,expect,afterEach} from 'vitest';
import {parseConfig} from './config';
const original=window.LCT_VIEWER_BOOTSTRAP;
afterEach(()=>{window.LCT_VIEWER_BOOTSTRAP=original;});
describe('伺服器 Viewer 設定',()=>{
 it('不採用任何前端環境變數中的私人權杖',()=>{
  const config=parseConfig({VITE_CESIUM_ION_ACCESS_TOKEN:'synthetic-must-not-be-used'} as ImportMetaEnv);
  expect(config.accessToken).toBe('');expect(config.modelSource).toEqual(original!.projects[0].modelSource);
 });
 it('缺少伺服器工作階段時拒絕初始化',()=>{delete window.LCT_VIEWER_BOOTSTRAP;expect(()=>parseConfig()).toThrow('登入已失效');});
 it('過期工作階段不能沿用目錄',()=>{window.LCT_VIEWER_BOOTSTRAP={...original!,sessionExpiresAt:1};expect(()=>parseConfig()).toThrow('登入已失效');});
});

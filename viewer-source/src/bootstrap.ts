import type {ViewerProject,ViewerComparison} from './projects';
export type ViewerBootstrap={
  role:'admin'|'viewer';sessionExpiresAt:number;
  access:{accessId:string;role:'admin'|'viewer';projectId?:string;projectIds?:string[];comparisonId?:string};
  projects:ViewerProject[];comparisons:ViewerComparison[];data:Record<string,unknown>;
  r2:null|{project:string;role:'admin'|'viewer';token:string;expiresAt:number};
  r2Access?:Record<string,{project:string;role:'admin'|'viewer';token:string;expiresAt:number}>;
};
declare global{interface Window{LCT_VIEWER_BOOTSTRAP?:ViewerBootstrap;}}
export function readBootstrap():ViewerBootstrap{
  const data=window.LCT_VIEWER_BOOTSTRAP;
  if(!data||!Array.isArray(data.projects)||data.projects.length===0||data.sessionExpiresAt<=Date.now()/1000)throw Error('登入已失效，請重新登入。');
  return data;
}

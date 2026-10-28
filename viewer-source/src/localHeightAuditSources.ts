import type {HeightControl} from './heightReference';
type AuditSource={id:string;points:Array<{id:string;matched:boolean;observationSpreadM:number|null;longitude?:number;latitude?:number;orthometric:number;ellipsoidal?:number|null}>;anchorReferences?:HeightControl[]};
/** Local diagnostics are optional inputs, never static imports required to
 * compile a fresh checkout. Do not move raw survey rows into Git or bundles. */
export async function loadLocalHeightAuditReferences(){
  if(import.meta.env.VITE_LOCAL_HEIGHT_AUDIT!=='1'||location.hostname!=='127.0.0.1')throw Error('Local audit only');
  const read=async(path:string)=>{
    const response=await fetch(path,{cache:'no-store'});
    if(!response.ok)throw Error('Local audit source unavailable');
    return response.json();
  };
  const [sources,ion1007Source,ion1007Dem]=await Promise.all([
    read('/analysis/20261027-height-audit/control-pairs.json') as Promise<AuditSource[]>,
    read('/analysis/20261028-height-audit/1007-ion-source.json') as Promise<AuditSource>,
    read('/analysis/20261028-height-audit/1007-dem-reference.json') as Promise<{samples:HeightControl[]}>
  ]);
  return {sources,ion1007Source,ion1007Dem};
}

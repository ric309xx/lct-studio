// Display repair only: retain exact source footprints, holes and area values.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),url='overlays/taoyuan-1010-v1/1010-cl2-02.geojson';
const file=path.join(root,'viewer-source/public',url),data=JSON.parse(fs.readFileSync(file,'utf8'));
const unchanged=()=>JSON.stringify(data.features.map(f=>({id:f.id,geometry:f.geometry,area:f.properties.projectedAreaM2,displayArea:f.properties.displayOnlyProjectionM2})));
const before=unchanged(),targets=[];
for(const f of data.features){
  if(f.properties.kind!=='occupancy-display'||!f.properties.displayRoofOnly)continue;
  f.properties.displayContinuousRoofSkin=true;
  f.properties.displayMeshHeightRepair=f.properties.displayCleanRoofSurface!==true;
  if(f.id==='display-1010-255-149-7'){
    // Source LAS 137.5-137.9 m roof; tiled white-metal facets locally reach
    // 140.4 m. Match only neutral metal texels in its unchanged XY footprint.
    f.properties.displayMetalMeshRepair=true;
    f.properties.displayMetalRepairRangeSourceZ=[137.1,140.8];
  }
  if(f.properties.analysisRegion==='255-149-gray-awning-front-extension'){
    // Newly measured LAS-supported front extension. Include its user-reviewed
    // metal side as existing mesh, but never add side area to the XY union.
    f.properties.displayHeightRangeSourceZ=[135.6,138.3];
  }
  targets.push(f.id);
}
if(unchanged()!==before)throw Error('Display-only repair changed analysis geometry or area');
const source=JSON.stringify(data,null,2)+'\n';
for(const base of ['viewer-source/public','3d-viewer'])fs.writeFileSync(path.join(root,base,url),source);
const audit={version:'20261022-255-display-v4',displayOnly:true,footprintsAndAreasUnchanged:true,geometryAndAreaSha256:createHash('sha256').update(before).digest('hex'),targets,method:'display preparation preserves the preceding v6 LAS analysis; thin roof skins plus neutral-metal-only repair of distorted upper facets; the newly measured front extension includes its user-reviewed metal side as existing-mesh classification, not a synthetic wall',metalRepairTarget:'display-1010-255-149-7',metalRepairSourceHeightRange:[137.1,140.8],lowerFasciaRegion:'255-149-gray-awning-front-extension',lowerFasciaClassificationSourceHeightRange:[135.6,138.3],lowerFasciaReview:'20261022 white metal picked at 121.214839069048,24.953373551853,137.374 m: outside old roof by 0.385 m but inside original CAD; added LAS-supported front region in model-regions v6 and recomputed measured union separately'};
fs.writeFileSync(path.join(root,'analysis/20261019-taoyuan-1010/255-display-audit.json'),JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify(audit));

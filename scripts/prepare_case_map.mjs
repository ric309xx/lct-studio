// Display-only WGS84 footprints, copied from existing cadastral overlays.
// Never derives parcel boundaries from model bounds or query points.
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const src=path.join(root,'viewer-source');
const catalogs=['1006','1010','1013','1013Cl2','1015'].flatMap(id=>JSON.parse(fs.readFileSync(path.join(src,`src/taoyuan${id}Parcels.json`),'utf8')));
const parcels=[{key:'sanzuwu-jiushe-102-45',overlayUrl:'overlays/taoyuan-building-overlay.geojson'},...catalogs];
const result={};
for(const parcel of parcels){
  const overlay=JSON.parse(fs.readFileSync(path.join(src,'public',parcel.overlayUrl),'utf8'));
  const features=overlay.features.filter(f=>f.properties?.kind==='cadastral-fill'&&f.properties?.parcelKey===parcel.key);
  const rings=features.flatMap(f=>f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[])
    .map(polygon=>polygon[0].map(([lon,lat])=>[lon,lat]));
  result[parcel.key]={source:parcel.overlayUrl,rings};
}
fs.writeFileSync(path.join(src,'src/caseMapGeometry.json'),JSON.stringify(result)+'\n');
console.log(`Prepared ${parcels.length} parcel map records; original boundaries unchanged.`);

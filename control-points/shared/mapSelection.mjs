import {pointAvailabilityRank} from './pointStatus.mjs';

// A selected marker and its cluster can both be hit. Deduplicate by ID,
// retaining points with the same code from different source datasets.
export function uniqueMapPoints(points) {
  return [...new Map(points.filter(p=>p?.id).map(p=>[p.id,p])).values()]
    .sort((a,b)=>pointAvailabilityRank(a)-pointAvailabilityRank(b)||String(a.code).localeCompare(String(b.code),'zh-Hant',{numeric:true})||String(a.dataset_id).localeCompare(String(b.dataset_id))||String(a.id).localeCompare(String(b.id)));
}

// Prefer available points, then the original control / leveling datasets.
// Natural code order breaks ties regardless of load order.
export function representativeMapPoint(points) {
  const ordered=uniqueMapPoints(points);
  const available=ordered.filter(p=>pointAvailabilityRank(p)===pointAvailabilityRank(ordered[0]));
  return available.find(p=>p.dataset_id==='zhongli-bade'||p.dataset_id==='leveling-109')
    ||available.find(p=>p.dataset_id!=='image-control-202610')||available[0];
}

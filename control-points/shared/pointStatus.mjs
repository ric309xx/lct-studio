import {datasetColor} from './datasets.mjs';

export const POINT_STATUS_STYLES=[
  {statuses:['新設點位'],label:'新設點位',color:'#f2c53d'},
  {statuses:['點位存在','完好'],label:'已確認／完好',color:'#2e7d32'},
  {statuses:['損壞'],label:'損壞',color:'#c46a1a'},
  {statuses:['找不到'],label:'找不到',color:'#6b7280'},
  {statuses:['滅失'],label:'滅失',color:'#202124'},
  {statuses:['無法進入'],label:'無法進入',color:'#80643f'}
];
export function pointStatusStyle(status){return POINT_STATUS_STYLES.find(s=>s.statuses.includes(status));}
export function pointAvailabilityRank(point){const rank={損壞:1,無法進入:1,找不到:2,滅失:3}[point?.status];return typeof rank==='number'?rank:0;}
export function pointColor(point,dataset){return pointStatusStyle(point?.status)?.color||datasetColor(dataset||{id:point?.dataset_id});}
export function pointStatusLegend(points){const statuses=new Set(points.map(p=>p.status));return POINT_STATUS_STYLES.filter(s=>s.statuses.some(status=>statuses.has(status)));}

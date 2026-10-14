export {PHOTO_CATEGORIES} from '../shared/fieldWorkflow.mjs';
// Preserve stored legacy labels; show them with the current category name.
export const photoCategory=(category:string)=>category==='周邊環境'?'環境':category;
const uploadDate=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function UploadTime({value,className='photo-upload-time'}:{value:string;className?:string}){
  const timestamp=new Date(value),valid=Number.isFinite(+timestamp);
  return <span className={className} title="上傳時間（台灣時間 UTC+8）">上傳：<time dateTime={valid?timestamp.toISOString():undefined}>{valid?uploadDate.format(timestamp):'時間未提供'}</time></span>;
}

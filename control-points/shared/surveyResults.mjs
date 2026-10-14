export function surveyResults(raw){
  if(typeof raw==='string'&&!raw.includes('"__survey"'))return null;
  try{const value=typeof raw==='string'?JSON.parse(raw):raw;return value?.__survey?.version===1?value.__survey:null;}catch{return null;}
}
export const isSurveyReport=attachment=>attachment.category==='GPS測量報告';

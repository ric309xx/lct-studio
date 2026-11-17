// 串流讀取即限制大小，避免先把不受控的上游內容全部放進記憶體。
export async function readBoundedText(response,limit){
  const length=response.headers.get('content-length');
  if(length&&Number(length)>limit){await response.body?.cancel();throw Error('上游索引超過大小限制');}
  const reader=response.body?.getReader();if(!reader)return '';
  const chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('上游索引超過大小限制');}chunks.push(value);}
  return Buffer.concat(chunks).toString('utf8');
}

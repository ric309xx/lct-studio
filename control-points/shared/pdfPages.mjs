// Canvas pages retain Chinese text and photo layout without external font downloads.
export function jpegPagesPdf(pages){
 if(!pages.length)throw new Error('PDF 沒有頁面');
 const encoder=new TextEncoder(),chunks=[],offsets=[0];let length=0;
 const add=value=>{const bytes=typeof value==='string'?encoder.encode(value):value;chunks.push(bytes);length+=bytes.length;};
 const object=(id,body)=>{offsets[id]=length;add(`${id} 0 obj\n`);add(body);add('\nendobj\n');};
 add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');object(1,'<< /Type /Catalog /Pages 2 0 R >>');
 object(2,`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
 for(const [i,page]of pages.entries()){
  const id=3+i*3;object(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.2756 841.8898] /Resources << /XObject << /Im0 ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`);
  offsets[id+1]=length;add(`${id+1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`);add(page.bytes);add('\nendstream\nendobj\n');
  const stream='q\n595.2756 0 0 841.8898 0 0 cm\n/Im0 Do\nQ\n';object(id+2,`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`);
 }
 const xref=length;add(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);for(let i=1;i<offsets.length;i++)add(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
 add(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
 const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return bytes;
}

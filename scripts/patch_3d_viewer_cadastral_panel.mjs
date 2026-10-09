import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(process.argv[2]??'.codex-tmp/viewer-build-20260927');
const app=join(root,'src/App.tsx');
let text=readFileSync(app,'utf8');
if(!text.includes('import { CadastralInfoPanel }')) {
  const start=text.indexOf('        <aside className="landmark-card cadastral-card"');
  const content=text.indexOf('          <p className="landmark-card-kicker">CADASTRAL INFO',start);
  const end=text.indexOf('        </aside>',content);
  if(start<0||content<0||end<0) throw new Error('Cadastral panel source not found');
  text=text.slice(0,start)+'        <CadastralInfoPanel key={selectedCadastral.parcelNo} parcelNo={selectedCadastral.parcelNo} onClose={() => setSelectedCadastral(null)}>\n'+text.slice(content,end)+'        </CadastralInfoPanel>'+text.slice(end+'        </aside>'.length);
  writeFileSync(app,'import { CadastralInfoPanel } from "./CadastralInfoPanel";\n'+text);
}
for(const file of ['CadastralInfoPanel.tsx','cadastralInfoPanel.css']) copyFileSync(resolve('scripts/viewer',file),join(root,'src',file));
console.log('Collapsible cadastral panel installed.');

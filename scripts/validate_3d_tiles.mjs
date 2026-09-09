import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = fs.realpathSync(process.argv[2]);
const output = process.argv[3];
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw Error('Symlink is not allowed: ' + full);
    if (entry.isDirectory()) walk(full);
    else files.push(full);
  }
}
walk(root);
const inventory = new Map(files.map(full => [path.relative(root, full).replaceAll('\\', '/'), full]));
const reached = new Set(), jsonSeen = new Set();
let references = 0;
function inspect(relative) {
  reached.add(relative);
  if (!relative.endsWith('.json') || jsonSeen.has(relative)) return;
  jsonSeen.add(relative);
  const data = JSON.parse(fs.readFileSync(inventory.get(relative), 'utf8'));
  function scan(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if ((key === 'uri' || key === 'url') && typeof child === 'string') {
        if (/^[a-z]+:|^[/\\]|[?#\\]/i.test(child)) throw Error('Non-relative URI: ' + child);
        const decoded = decodeURIComponent(child);
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), decoded));
        if (target.startsWith('../') || !inventory.has(target)) throw Error('Missing/escaping URI: ' + relative + ' -> ' + child);
        references++;
        inspect(target);
      } else scan(child);
    }
  }
  scan(data);
}
if (!inventory.has('tileset.json')) throw Error('Missing root tileset');
inspect('tileset.json');
for (const rel of inventory.keys()) if (rel.endsWith('.json')) inspect(rel);
const objects = [];
for (const [relative, full] of inventory) {
  const data = fs.readFileSync(full);
  if (relative.endsWith('.b3dm') && (data.toString('ascii', 0, 4) !== 'b3dm' || data.readUInt32LE(8) !== data.length)) throw Error('Invalid b3dm: ' + relative);
  objects.push({relative, size: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex'), md5: crypto.createHash('md5').update(data).digest('hex')});
}
const report = {checkedAt: new Date().toISOString(), root, objectCount: objects.length, bytes: objects.reduce((s,o)=>s+o.size,0), jsonCount: jsonSeen.size, references, unreachable: [...inventory.keys()].filter(k=>!reached.has(k)), rootBoundingVolume: JSON.parse(fs.readFileSync(path.join(root,'tileset.json'),'utf8')).root.boundingVolume, objects};
if (report.unreachable.length) throw Error('Unreachable files: ' + report.unreachable.join(', '));
if (output) fs.writeFileSync(output, JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,objects: undefined}));

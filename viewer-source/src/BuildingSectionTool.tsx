import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  Cartesian2, Cartesian3, Cartographic, Cesium3DTileset,
  Color, Matrix4, Ray, ScreenSpaceEventHandler,
  ScreenSpaceEventType, Transforms, Viewer
} from 'cesium';
import { Download, Layers3, Trash2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { area, limitVertices, simplifyOrthogonal, splitPolygon, traceOccupiedBoundaries, type Point2 } from './section-outline';

type Props = { enabled: boolean; viewer: Viewer | null; tileset: Cesium3DTileset | null; projectName: string };
type Bounds = { center: Cartesian3; east: number; north: number; width: number; height: number };
type RayPickingScene = { pickFromRay(ray: Ray, excluded?: unknown[]): { position?: Cartesian3 } | undefined };

export function BuildingSectionTool({ enabled, viewer, tileset, projectName }: Props) {
  const [selecting, setSelecting] = useState(false);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [cutHeight, setCutHeight] = useState(0);
  const [heightRange, setHeightRange] = useState<[number, number]>([0, 1]);
  const [outlines, setOutlines] = useState<Point2[][]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('先點選建物範圍的兩個對角。');
  const [editorOpen, setEditorOpen] = useState(false);
  const clicksRef = useRef<Cartesian3[]>([]);
  const sampleRef = useRef<{ heights: number[][]; rows: number; cols: number } | null>(null);
  const planeEntityRef = useRef<ReturnType<Viewer['entities']['add']> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => () => {
    if (viewer && planeEntityRef.current) viewer.entities.remove(planeEntityRef.current);
  }, [tileset]);

  useEffect(() => {
    if (!enabled || !viewer || !tileset || !selecting) return;
    clicksRef.current = [];
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event: { position: Cartesian2 }) => {
      const point = viewer.scene.pickPosition(event.position);
      if (!point) { setNotice('這裡沒有讀取到模型，請點在建物表面。'); return; }
      clicksRef.current.push(Cartesian3.clone(point));
      setNotice(clicksRef.current.length === 1 ? '請點選範圍另一個對角。' : '範圍已選取。');
      if (clicksRef.current.length === 2) {
        const next = makeBounds(clicksRef.current[0], clicksRef.current[1]);
        const heights = clicksRef.current.map((p) => Cartographic.fromCartesian(p).height);
        const radius = Math.max(10, tileset.boundingSphere.radius);
        const heightPadding = Math.max(20, radius * .35);
        setBounds(next);
        setHeightRange([Math.floor(Math.min(...heights) - heightPadding), Math.ceil(Math.max(...heights) + heightPadding)]);
        setCutHeight(Math.round(Math.min(...heights) * 10) / 10);
        setSelecting(false);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => handler.destroy();
  }, [enabled, selecting, tileset, viewer]);

  useEffect(() => {
    if (!tileset || !bounds || !viewer) return;
    const centerHeight = Cartographic.fromCartesian(bounds.center).height;
    if (viewer && planeEntityRef.current) viewer.entities.remove(planeEntityRef.current);
    const localZ = cutHeight - centerHeight;
    const corners = [
      new Cartesian3(bounds.east - bounds.width / 2, bounds.north - bounds.height / 2, localZ),
      new Cartesian3(bounds.east + bounds.width / 2, bounds.north - bounds.height / 2, localZ),
      new Cartesian3(bounds.east + bounds.width / 2, bounds.north + bounds.height / 2, localZ),
      new Cartesian3(bounds.east - bounds.width / 2, bounds.north + bounds.height / 2, localZ)
    ].map((point) => Matrix4.multiplyByPoint(Transforms.eastNorthUpToFixedFrame(bounds.center), point, new Cartesian3()));
    planeEntityRef.current = viewer?.entities.add({ polygon: { hierarchy: corners, perPositionHeight: true, material: Color.fromCssColorString('#69e4d0').withAlpha(.24), outline: true, outlineColor: Color.fromCssColorString('#69e4d0') } }) ?? null;
    viewer.scene.requestRender();
    return () => {
      if (viewer && planeEntityRef.current) viewer.entities.remove(planeEntityRef.current);
      planeEntityRef.current = null;
    };
  }, [bounds, cutHeight, tileset, viewer]);

  async function generate() {
    if (!viewer || !bounds) return;
    setBusy(true); setNotice('正在取樣模型表面…');
    try {
      if (planeEntityRef.current) planeEntityRef.current.show = false;
      viewer.scene.requestRender();
      await new Promise(requestAnimationFrame);
      const rows = 42, cols = 42;
      const frame = Transforms.eastNorthUpToFixedFrame(bounds.center);
      const heights: number[][] = Array.from({ length: rows }, () => Array(cols).fill(Number.NEGATIVE_INFINITY));
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const east = bounds.east - bounds.width / 2 + bounds.width * (x + .5) / cols;
          const north = bounds.north - bounds.height / 2 + bounds.height * (y + .5) / rows;
          const origin = Matrix4.multiplyByPoint(frame, new Cartesian3(east, north, 300), new Cartesian3());
          const down = Matrix4.multiplyByPointAsVector(frame, new Cartesian3(0, 0, -1), new Cartesian3());
          Cartesian3.normalize(down, down);
          const hit = (viewer.scene as unknown as RayPickingScene).pickFromRay(new Ray(origin, down), planeEntityRef.current ? [planeEntityRef.current] : undefined);
          if (hit?.position) heights[y][x] = Cartographic.fromCartesian(hit.position).height;
        }
        if (y % 5 === 0) await new Promise(requestAnimationFrame);
      }
      sampleRef.current = { heights, rows, cols };
      updateOutline(heights, rows, cols, bounds, cutHeight);
    } catch (error) {
      console.error('Failed to sample building section', error);
      setNotice('輪廓取樣失敗，請稍後重試或重新選擇範圍。');
    } finally {
      if (planeEntityRef.current) planeEntityRef.current.show = true;
      viewer.scene.requestRender();
      setBusy(false);
    }
  }

  function updateOutline(heights: number[][], rows: number, cols: number, box: Bounds, height: number) {
    const occupied = heights.map((row) => row.map((value) => value >= height));
    const minimumCells = 3;
    const next = traceOccupiedBoundaries(occupied)
      .filter((loop) => Math.abs(area(loop)) >= minimumCells)
      .map(simplifyOrthogonal)
      .map((loop) => limitVertices(loop.map((p) => ({ x: (p.x / cols - .5) * box.width, y: (p.y / rows - .5) * box.height })), 10))
      .filter((loop) => loop.length >= 3);
    setOutlines(next);
    const pointCount = next.reduce((sum, loop) => sum + loop.length, 0);
    setNotice(next.length ? `已產生 ${next.length} 個圖塊、共 ${pointCount} 個輪廓節點，可進入編修。` : '這個高度沒有形成完整輪廓，請調整高度或重選範圍。');
  }

  function changeHeight(value: number) {
    setCutHeight(value);
    const sample = sampleRef.current;
    if (sample && bounds) updateOutline(sample.heights, sample.rows, sample.cols, bounds, value);
  }

  function clear() {
    setBounds(null); setOutlines([]); sampleRef.current = null; setSelecting(false);
    if (viewer && planeEntityRef.current) viewer.entities.remove(planeEntityRef.current);
    setNotice('先點選建物範圍的兩個對角。');
  }

  if (!enabled) return null;
  return <>
    <div className="setting-group section-tool">
      <span className="setting-label"><Layers3 size={15}/> 建物水平切片（測試）</span>
      {!bounds ? <button className="section-primary" disabled={!viewer || !tileset} onClick={() => setSelecting(true)}>{selecting ? '請在模型點兩個對角…' : '選擇建物範圍'}</button> : <>
        <label className="section-height"><span>切面高程 <strong>{cutHeight.toFixed(1)} m</strong></span><input type="range" min={heightRange[0]} max={heightRange[1]} step="0.2" value={cutHeight} onChange={(e) => changeHeight(Number(e.target.value))}/></label>
        {outlines.length > 0 && <SectionPreview outlines={outlines}/>}
        <div className="clip-actions"><button className="primary" disabled={busy} onClick={generate}>{busy ? '取樣中…' : '產生平面輪廓'}</button><button disabled={!outlines.length} onClick={() => setEditorOpen(true)}>編修／匯出</button><button onClick={clear}>重選</button></div>
      </>}
      <p className="clip-notice">{notice}</p><p className="section-warning">模型不會被裁掉；切面會即時移動。每個獨立圖塊最多 10 點，正式測繪前仍需用現場尺寸校核。</p>
    </div>
    {editorOpen && createPortal(<OutlineEditor outlines={outlines} setOutlines={setOutlines} canvasRef={canvasRef} height={cutHeight} projectName={projectName} onClose={() => setEditorOpen(false)}/>, document.body)}
  </>;
}

function makeBounds(a: Cartesian3, b: Cartesian3): Bounds {
  const center = Cartesian3.midpoint(a, b, new Cartesian3());
  const inverse = Matrix4.inverse(Transforms.eastNorthUpToFixedFrame(center), new Matrix4());
  const la = Matrix4.multiplyByPoint(inverse, a, new Cartesian3());
  const lb = Matrix4.multiplyByPoint(inverse, b, new Cartesian3());
  return { center, east: (la.x + lb.x) / 2, north: (la.y + lb.y) / 2, width: Math.max(2, Math.abs(lb.x - la.x)), height: Math.max(2, Math.abs(lb.y - la.y)) };
}

function SectionPreview({ outlines }: { outlines: Point2[][] }) {
  const values=outlines.flatMap(shape=>shape.flatMap(p=>[Math.abs(p.x),Math.abs(p.y)]));
  const extent=Math.max(...values,1);
  const path=(shape:Point2[])=>shape.map((p,i)=>`${i?'L':'M'} ${50+p.x*44/extent} ${50-p.y*44/extent}`).join(' ')+' Z';
  return <div className="section-preview" aria-label="目前切面輪廓預覽"><span>切面預覽 · {outlines.length} 個圖塊</span><svg viewBox="0 0 100 100" role="img">{outlines.map((shape,index)=><path key={index} d={path(shape)}/>)}</svg></div>;
}

type Selection = { shape: number; point: number };
type SegmentHit = { shape: number; segment: number; projected: Point2; distance: number };
const PDF_SCALES = [100, 200, 500, 600, 1000, 1200] as const;

function OutlineEditor({ outlines, setOutlines, canvasRef, height, projectName, onClose }: { outlines: Point2[][]; setOutlines: (p: Point2[][]) => void; canvasRef: RefObject<HTMLCanvasElement | null>; height: number; projectName: string; onClose: () => void }) {
  const initialExtent = useRef(Math.max(...outlines.flatMap((shape) => shape.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)])), 1));
  const manualBackup = useRef<Point2[][] | null>(null);
  const manualTargetRef = useRef<number | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [splitStart, setSplitStart] = useState<Selection | null>(null);
  const [splitMessage, setSplitMessage] = useState('');
  const [selected, setSelected] = useState<Selection | null>(null);
  const [selectedShape, setSelectedShape] = useState<number | null>(null);
  const [labelPickMode, setLabelPickMode] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
  const [labelsFiltered, setLabelsFiltered] = useState(false);
  const [printScale, setPrintScale] = useState<number>(() => findFittingPdfScale(outlines));
  const [pdfNotice, setPdfNotice] = useState('');
  const scale = 390 / initialExtent.current;
  const map = (p: Point2) => ({ x: 450 + p.x * scale, y: 450 - p.y * scale });
  useEffect(() => { draw(canvasRef.current, outlines, map, height, manualMode, manualBackup.current ?? [], splitStart, labelPickMode, labelsFiltered, selectedLabels, selectedShape); });
  function locate(e: PointerEvent<HTMLCanvasElement>) { const r=e.currentTarget.getBoundingClientRect(); return {x:(e.clientX-r.left)*900/r.width,y:(e.clientY-r.top)*900/r.height}; }
  function nearest(q:{x:number;y:number}):Selection|null { let bestShape=-1,bestPoint=-1,d=25;outlines.forEach((shape,s)=>shape.forEach((p,i)=>{const n=Math.hypot(map(p).x-q.x,map(p).y-q.y);if(n<d){d=n;bestShape=s;bestPoint=i;}}));return bestShape<0?null:{shape:bestShape,point:bestPoint}; }
  function nearestSegment(q:Point2,maxDistance=30):SegmentHit|null {let best:SegmentHit|null=null;outlines.forEach((shape,s)=>shape.forEach((p,i)=>{const projected=projectToSegment(q,map(p),map(shape[(i+1)%shape.length]));const distance=Math.hypot(projected.x-q.x,projected.y-q.y);if(distance<=maxDistance&&(!best||distance<best.distance))best={shape:s,segment:i,projected,distance};}));return best;}
  function fromCanvas(q: Point2): Point2 { return { x: (q.x - 450) / scale, y: (450 - q.y) / scale }; }
  function addPoint(e: PointerEvent<HTMLCanvasElement>) { if(manualMode||splitMode||labelPickMode)return;const q=locate(e);let bestShape=-1,bestPoint=-1,d=Infinity;outlines.forEach((shape,s)=>{if(shape.length>=10)return;shape.forEach((p,i)=>{const n=segmentDistance(q,map(p),map(shape[(i+1)%shape.length]));if(n<d){d=n;bestShape=s;bestPoint=i;}})});if(bestShape<0)return;const next=outlines.map(shape=>[...shape]);next[bestShape].splice(bestPoint+1,0,fromCanvas(q));setOutlines(next);setSelectedLabels(new Set());setLabelsFiltered(false);setSelected({shape:bestShape,point:bestPoint+1}); }
  function pointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const q = locate(e);
    if (manualMode) {
      const shape=outlines[0]??[];if(shape.length>=10)return;
      setOutlines([[...shape,fromCanvas(q)]]);
      setSelected({shape:0,point:shape.length});
      return;
    }
    if(labelPickMode){const hit=nearestSegment(q);if(!hit)return;const key=`${hit.shape}:${hit.segment}`;setSelectedLabels(current=>{const next=new Set(current);next.has(key)?next.delete(key):next.add(key);return next;});return;}
    if (splitMode) {
      const lineHit=nearestSegment(q);
      if(!lineHit){setSplitMessage('請點選輪廓線上的位置。');return;}
      if(!splitStart){const next=outlines.map(shape=>[...shape]);const inserted=lineHit.segment+1;next[lineHit.shape].splice(inserted,0,fromCanvas(lineHit.projected));setOutlines(next);setSplitStart({shape:lineHit.shape,point:inserted});setSplitMessage('已選第一個切點，請在同一圖塊的另一段線上選第二個切點。');return;}
      if(lineHit.shape!==splitStart.shape){setSplitMessage('兩個切點必須位於同一個圖塊。');return;}
      const next=outlines.map(shape=>[...shape]);const secondIndex=lineHit.segment+1;next[lineHit.shape].splice(secondIndex,0,fromCanvas(lineHit.projected));const adjustedStart=secondIndex<=splitStart.point?splitStart.point+1:splitStart.point;
      const split=splitPolygon(next[lineHit.shape],adjustedStart,secondIndex);
      if(!split){setSplitMessage('切點不能相鄰，兩側都必須至少保留 3 個節點。');return;}
      const [first,second]=split;
      next.splice(lineHit.shape,1,first,second);setOutlines(next);setSplitStart(null);setSplitMode(false);setSplitMessage('圖塊已切分成兩塊。');setSelectedLabels(new Set());setLabelsFiltered(false);setSelected(null);return;
    }
    const vertex=nearest(q),shapeHit=vertex?.shape??findShapeAtPoint(outlines,fromCanvas(q));setSelected(vertex);setSelectedShape(shapeHit);
  }
  function move(e: PointerEvent<HTMLCanvasElement>) { if(manualMode||splitMode||labelPickMode||!selected||!(e.buttons&1))return;const next=outlines.map(shape=>[...shape]);next[selected.shape][selected.point]=fromCanvas(locate(e));setOutlines(next); }
  function startManual(target:number|null) { manualBackup.current=outlines.map(shape=>[...shape]);manualTargetRef.current=target;setOutlines([[]]);setSelected(null);setSelectedShape(null);setSplitMode(false);setSplitStart(null);setLabelPickMode(false);setSelectedLabels(new Set());setLabelsFiltered(false);setManualMode(true); }
  function restoreAutomatic() { if(manualBackup.current)setOutlines(manualBackup.current);manualTargetRef.current=null;setSelected(null);setSelectedShape(null);setManualMode(false); }
  function finishManual() { const draft=outlines[0]??[];if(draft.length<3||!manualBackup.current)return;const next=manualBackup.current.map(shape=>[...shape]);if(manualTargetRef.current===null)next.push(draft);else next[manualTargetRef.current]=draft;setOutlines(next);setSelectedShape(manualTargetRef.current===null?next.length-1:manualTargetRef.current);manualTargetRef.current=null;setSelected(null);setManualMode(false); }
  function deletePoint(){if(!selected)return;const next=outlines.map(shape=>[...shape]);next[selected.shape].splice(selected.point,1);if(next[selected.shape].length<3)next.splice(selected.shape,1);setOutlines(next);setSelectedLabels(new Set());setLabelsFiltered(false);setSelected(null);}
  function deleteShape(){if(selectedShape===null)return;setOutlines(outlines.filter((_,index)=>index!==selectedShape));setSelected(null);setSelectedShape(null);setSelectedLabels(new Set());setLabelsFiltered(false);}
  function toggleSplit(){setSplitMode(value=>!value);setLabelPickMode(false);setSplitStart(null);setSelected(null);setSplitMessage(splitMode?'':'請在同一圖塊的輪廓線上選擇兩個切點。');}
  function startLabelPicking(){setLabelPickMode(true);setSplitMode(false);setSplitStart(null);setSelectedLabels(new Set());setSelected(null);}
  function confirmLabels(){setLabelPickMode(false);setLabelsFiltered(true);}
  function showAllLabels(){setLabelPickMode(false);setLabelsFiltered(false);setSelectedLabels(new Set());}
  function exportJpg(){const canvas=canvasRef.current;if(!canvas)return;canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob);const a=document.createElement('a');a.download=`建物平面輪廓_${height.toFixed(1)}m.jpg`;a.href=url;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/jpeg',.94);}
  const pointCount=outlines.reduce((sum,shape)=>sum+shape.length,0),totalArea=outlines.reduce((sum,shape)=>sum+Math.abs(area(shape)),0);
  const modelSize=getOutlineSize(outlines),fitsA4=modelSize.width*1000/printScale<=265&&modelSize.height*1000/printScale<=132;
  function exportPdf(){setPdfNotice('正在產生 PDF…');try{createA4Pdf({outlines,height,projectName,scale:printScale,labelsFiltered,selectedLabels});setPdfNotice('PDF 已開始下載。');}catch(error){console.error('Failed to export A4 PDF',error);setPdfNotice('PDF 產生失敗，請稍後再試。');}}
  return <div className="section-editor-backdrop"><section className="section-editor" role="dialog" aria-modal="true" aria-label="平面輪廓編修"><header><div><b>平面輪廓編修</b><small>{manualMode?(manualTargetRef.current===null?'依序點選新圖塊轉角，最多 10 點；灰線為既有圖塊。':'依序點選取代輪廓轉角，最多 10 點；灰線為原始圖塊。'):splitMode?(splitMessage||'在線上選擇兩個切點。'):labelPickMode?'點選要保留長度文字的線段，選好後按「確定標註」。':selectedShape===null?'點選圖塊即可選取；也可拖曳節點或雙擊線段新增節點。':`已選擇圖塊 ${selectedShape+1}，可刪除或手繪取代。`}</small></div><button onClick={onClose}>×</button></header><canvas ref={canvasRef} width="900" height="900" onDoubleClick={addPoint} onPointerDown={pointerDown} onPointerMove={move}/><footer><span>圖塊 {outlines.length} · 節點 {pointCount} · 約 {totalArea.toFixed(1)} m²{!splitMode&&splitMessage?` · ${splitMessage}`:''}</span>{manualMode?<><button onClick={restoreAutomatic}>取消手繪</button><button className="primary" disabled={(outlines[0]?.length??0)<3} onClick={finishManual}>{manualTargetRef.current===null?'完成新增':'完成取代'}</button></>:labelPickMode?<><button onClick={showAllLabels}>取消／顯示全部</button><button className="primary" disabled={!selectedLabels.size} onClick={confirmLabels}>確定標註（{selectedLabels.size}）</button></>:<><button className={splitMode?'primary':''} onClick={toggleSplit}>{splitMode?'取消切分':'切分圖塊'}</button><button onClick={startLabelPicking}>{labelsFiltered?'重選尺寸':'選擇尺寸'}</button>{labelsFiltered&&<button onClick={showAllLabels}>顯示全部尺寸</button>}<button onClick={()=>startManual(null)}>新增圖塊</button><button disabled={selectedShape===null||splitMode} onClick={()=>startManual(selectedShape)}>手繪取代</button><button disabled={selectedShape===null||splitMode} onClick={deleteShape}><Trash2 size={15}/>刪除圖塊</button><button disabled={!selected||splitMode} onClick={deletePoint}><Trash2 size={15}/>刪除節點</button><button className="primary" disabled={!outlines.length||splitMode} onClick={exportJpg}><Download size={15}/>JPG</button><label className="pdf-scale">比例 1:<select value={printScale} onChange={e=>{setPrintScale(Number(e.target.value));setPdfNotice('');}}>{PDF_SCALES.map(value=><option key={value} value={value}>{value}</option>)}</select></label><button className="primary" disabled={!outlines.length||splitMode||!fitsA4} onClick={exportPdf}><Download size={15}/>A4 PDF</button>{!fitsA4&&<small className="pdf-scale-warning">此比例放不進 A4，請選較大的比例值</small>}{pdfNotice&&<small className="pdf-export-notice" role="status">{pdfNotice}</small>}</>}</footer></section></div>;
}

function segmentDistance(p: Point2, a: Point2, b: Point2) { const dx=b.x-a.x,dy=b.y-a.y;const length=dx*dx+dy*dy;if(!length)return Math.hypot(p.x-a.x,p.y-a.y);const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy); }
function projectToSegment(p:Point2,a:Point2,b:Point2):Point2 {const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;if(!length)return a;const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length));return{x:a.x+t*dx,y:a.y+t*dy};}
function findShapeAtPoint(outlines:Point2[][],point:Point2){for(let shapeIndex=outlines.length-1;shapeIndex>=0;shapeIndex-=1){const shape=outlines[shapeIndex];let inside=false;for(let i=0,j=shape.length-1;i<shape.length;j=i++){const a=shape[i],b=shape[j],crosses=(a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x;if(crosses)inside=!inside;}if(inside)return shapeIndex;}return null;}

function getOutlineSize(outlines:Point2[][]){const points=outlines.flat();if(!points.length)return{minX:0,maxX:0,minY:0,maxY:0,width:0,height:0};const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);return{minX,maxX,minY,maxY,width:maxX-minX,height:maxY-minY};}

function findFittingPdfScale(outlines:Point2[][]){const size=getOutlineSize(outlines);return PDF_SCALES.find(scale=>size.width*1000/scale<=265&&size.height*1000/scale<=132)??PDF_SCALES[PDF_SCALES.length-1];}

function createA4Pdf({outlines,height,projectName,scale,labelsFiltered,selectedLabels}:{outlines:Point2[][];height:number;projectName:string;scale:number;labelsFiltered:boolean;selectedLabels:Set<string>}){
  const pageWidth=297,pageHeight=210,pixelsPerMm=8;
  const canvas=document.createElement('canvas');canvas.width=pageWidth*pixelsPerMm;canvas.height=pageHeight*pixelsPerMm;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const mm=(value:number)=>value*pixelsPerMm;
  const line=(x1:number,y1:number,x2:number,y2:number)=>{ctx.beginPath();ctx.moveTo(mm(x1),mm(y1));ctx.lineTo(mm(x2),mm(y2));ctx.stroke();};
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#111';ctx.lineWidth=mm(.35);ctx.strokeRect(mm(8),mm(8),mm(281),mm(194));
  ctx.fillStyle='#111';ctx.font=`700 ${mm(6)}px "Noto Sans TC","Microsoft JhengHei",sans-serif`;ctx.fillText('建物水平切片平面圖',mm(12),mm(20));
  ctx.font=`${mm(2.8)}px "Noto Sans TC","Microsoft JhengHei",sans-serif`;ctx.fillStyle='#4d5960';ctx.fillText('BUILDING HORIZONTAL SECTION PLAN',mm(12),mm(25));
  ctx.textAlign='right';ctx.fillText(`切面高程 ${height.toFixed(1)} m  |  比例 1:${scale}`,mm(285),mm(20));ctx.textAlign='left';
  const drawing={x:16,y:32,w:265,h:132};ctx.strokeStyle='#c9d2d6';ctx.lineWidth=mm(.2);ctx.strokeRect(mm(drawing.x),mm(drawing.y),mm(drawing.w),mm(drawing.h));
  for(let x=drawing.x+10;x<drawing.x+drawing.w;x+=10)line(x,drawing.y,x,drawing.y+drawing.h);for(let y=drawing.y+10;y<drawing.y+drawing.h;y+=10)line(drawing.x,y,drawing.x+drawing.w,y);
  const size=getOutlineSize(outlines),centerX=(size.minX+size.maxX)/2,centerY=(size.minY+size.maxY)/2,drawCenterX=drawing.x+drawing.w/2,drawCenterY=drawing.y+drawing.h/2,toMm=(meters:number)=>meters*1000/scale;
  const mapPoint=(p:Point2)=>({x:drawCenterX+toMm(p.x-centerX),y:drawCenterY-toMm(p.y-centerY)});
  ctx.strokeStyle='#101d23';ctx.lineWidth=mm(.55);ctx.fillStyle='rgba(124,241,213,.10)';outlines.forEach(shape=>{ctx.beginPath();shape.forEach((p,index)=>{const q=mapPoint(p);index?ctx.lineTo(mm(q.x),mm(q.y)):ctx.moveTo(mm(q.x),mm(q.y));});ctx.closePath();ctx.fill();ctx.stroke();});
  ctx.setLineDash([mm(1.5),mm(1)]);ctx.strokeStyle='#6e7f86';ctx.lineWidth=mm(.25);const boundWidth=toMm(size.width),boundHeight=toMm(size.height);ctx.strokeRect(mm(drawCenterX-boundWidth/2),mm(drawCenterY-boundHeight/2),mm(boundWidth),mm(boundHeight));ctx.setLineDash([]);
  ctx.font=`${mm(2.5)}px "Noto Sans TC","Microsoft JhengHei",sans-serif`;ctx.textAlign='center';outlines.forEach((shape,shapeIndex)=>shape.forEach((p,index)=>{const key=`${shapeIndex}:${index}`;if(labelsFiltered&&!selectedLabels.has(key))return;const next=shape[(index+1)%shape.length],a=mapPoint(p),b=mapPoint(next),length=Math.hypot(next.x-p.x,next.y-p.y);const x=(a.x+b.x)/2,y=(a.y+b.y)/2;ctx.fillStyle='rgba(255,255,255,.92)';ctx.fillRect(mm(x-6),mm(y-2.2),mm(12),mm(4.4));ctx.fillStyle='#111';ctx.fillText(`${length.toFixed(1)} m`,mm(x),mm(y+1));}));ctx.textAlign='left';
  ctx.strokeStyle='#111';ctx.lineWidth=mm(.3);ctx.strokeRect(mm(8),mm(172),mm(281),mm(30));line(8,182,289,182);line(8,192,289,192);line(202,172,202,202);line(245,172,245,202);line(105,172,105,202);
  ctx.font=`${mm(2.5)}px "Noto Sans TC","Microsoft JhengHei",sans-serif`;ctx.fillStyle='#111';const fit=(text:string,max=28)=>text.length>max?`${text.slice(0,max-1)}…`:text;
  ctx.fillText(`專案名稱：${fit(projectName)}`,mm(11),mm(178.5));ctx.fillText('圖名：建物水平切片平面圖',mm(108),mm(178.5));ctx.fillText(`切面高程：${height.toFixed(1)} m`,mm(11),mm(188.5));ctx.fillText(`模型外框：${size.width.toFixed(1)} x ${size.height.toFixed(1)} m`,mm(108),mm(188.5));ctx.fillText('備註：本圖由三維模型切片產生，施工或測繪使用前須經現場尺寸校核。',mm(11),mm(198.5));
  const date=new Intl.DateTimeFormat('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());ctx.fillText(`比例  1:${scale}`,mm(205),mm(178.5));ctx.fillText(`日期  ${date}`,mm(205),mm(188.5));ctx.fillText('製圖  LCT',mm(205),mm(198.5));ctx.fillText('圖號  A-01',mm(248),mm(178.5));ctx.fillText('紙張  A4 橫式',mm(248),mm(188.5));ctx.fillText('單位  公尺',mm(248),mm(198.5));
  ctx.textAlign='center';ctx.font=`700 ${mm(3)}px sans-serif`;ctx.fillText('N',mm(276),mm(38));line(276,40,276,49);ctx.beginPath();ctx.moveTo(mm(276),mm(39));ctx.lineTo(mm(273.5),mm(43));ctx.lineTo(mm(278.5),mm(43));ctx.closePath();ctx.fill();
  const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});pdf.addImage(canvas.toDataURL('image/jpeg',.94),'JPEG',0,0,pageWidth,pageHeight,undefined,'FAST');pdf.save(`${projectName.replace(/[\\/:*?"<>|]/g,'_')}_水平切片_1-${scale}.pdf`);
}

function draw(canvas: HTMLCanvasElement | null, outlines: Point2[][], map: (p:Point2)=>Point2, height:number, manualMode = false, reference: Point2[][] = [], splitStart: Selection | null = null, labelPickMode = false, labelsFiltered = false, selectedLabels: Set<string> = new Set(), selectedShape: number | null = null) {
  if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;ctx.fillStyle='#fff';ctx.fillRect(0,0,900,900);ctx.strokeStyle='#d7dce0';ctx.lineWidth=1;for(let i=50;i<900;i+=50){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,900);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(900,i);ctx.stroke();}
  if(manualMode){ctx.strokeStyle='rgba(90,112,120,.58)';ctx.lineWidth=4;reference.forEach(shape=>{if(shape.length<3)return;ctx.beginPath();shape.forEach((p,i)=>{const q=map(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});ctx.closePath();ctx.stroke();});}
  outlines.forEach((points,shapeIndex)=>{ctx.strokeStyle=manualMode?'#19bfa5':shapeIndex===selectedShape?'#ef6b4d':'#17252c';ctx.lineWidth=shapeIndex===selectedShape?8:5;ctx.beginPath();points.forEach((p,i)=>{const q=map(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});if(points.length>=3)ctx.closePath();ctx.stroke();});ctx.font='15px sans-serif';outlines.forEach((points,shapeIndex)=>points.forEach((p,i)=>{if(points.length<2||(manualMode&&points.length<3&&i===points.length-1))return;const key=`${shapeIndex}:${i}`,isSelected=selectedLabels.has(key);if(labelsFiltered&&!isSelected)return;const n=points[(i+1)%points.length],length=Math.hypot(n.x-p.x,n.y-p.y);if(length<2)return;const a=map(p),b=map(n);ctx.fillStyle=isSelected?'rgba(25,191,165,.9)':labelPickMode?'rgba(230,235,237,.68)':'rgba(255,255,255,.85)';const label=`${length.toFixed(1)} m`,x=(a.x+b.x)/2,y=(a.y+b.y)/2;ctx.fillRect(x-28,y-10,56,20);ctx.fillStyle=isSelected?'#fff':'#17252c';ctx.textAlign='center';ctx.fillText(label,x,y+5);}));ctx.textAlign='start';ctx.fillStyle='#7cf1d5';outlines.flat().forEach(p=>{const q=map(p);ctx.beginPath();ctx.arc(q.x,q.y,8,0,Math.PI*2);ctx.fill();});if(splitStart){const q=map(outlines[splitStart.shape][splitStart.point]);ctx.fillStyle='#ff835c';ctx.beginPath();ctx.arc(q.x,q.y,13,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#17252c';ctx.lineWidth=3;ctx.stroke();}ctx.fillStyle='#17252c';ctx.font='bold 24px sans-serif';ctx.fillText(`建物水平切片  高程 ${height.toFixed(1)} m`,35,42);ctx.font='18px sans-serif';ctx.fillText(manualMode?`灰線：既有輪廓｜綠線：手繪輪廓（${outlines[0]?.length??0}/10）`:labelPickMode?`尺寸選取中｜已選 ${selectedLabels.size} 段`:selectedShape===null?'點選圖塊以選取｜輸出前須經現場尺寸校核':`已選擇圖塊 ${selectedShape+1}｜橘線為目前選取`,35,870);
}

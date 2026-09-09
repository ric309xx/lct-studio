
const headers = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply = (data,status=200) => Response.json(data,{status,headers});
export async function landmarksApi(request, env, session, project) {
  const KEY = project.landmarksKey;
  if (!session) return reply({error:'請先登入'},401);
  if (request.method === 'GET') {
    const object = await env.MODELS.get(KEY);
    return reply(object ? {landmarks:(await object.json()).landmarks,version:object.etag} : {landmarks:[],version:null});
  }
  if (request.method !== 'PUT') return reply({error:'不支援此操作'},405);
  if (session.role !== 'admin') return reply({error:'僅管理員可儲存'},403);
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({error:'來源不符'},403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({error:'需要 JSON'},415);
  const reader = request.body?.getReader();
  if (!reader) return reply({error:'缺少內容'},400);
  let size=0; const chunks=[];
  while (true) {
    const {done,value}=await reader.read(); if(done)break;
    size+=value.byteLength;
    if(size>65536){await reader.cancel();return reply({error:'資料過大'},413);}
    chunks.push(value);
  }
  let data;
  try {data=JSON.parse(await new Blob(chunks).text());} catch {return reply({error:'JSON 格式錯誤'},400);}
  if (!Array.isArray(data.landmarks)||data.landmarks.length>100 || !(data.version===null || typeof data.version==='string')) return reply({error:'格式錯誤'},400);
  const ids=new Set();
  for(const p of data.landmarks){
    if(!p || typeof p.id!=='string'||! /^[\w-]{1,64}$/.test(p.id)||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||typeof p.description!=='string'||p.description.length>1000||!Number.isFinite(p.longitude)||Math.abs(p.longitude)>180||!Number.isFinite(p.latitude)||Math.abs(p.latitude)>90||!Number.isFinite(p.height)||Math.abs(p.height)>100000) return reply({error:'標的內容不合法'},400);
    ids.add(p.id);
  }
  const landmarks=data.landmarks.map(({id,name,description,longitude,latitude,height})=>({id,name:name.trim(),description,longitude,latitude,height}));
  const object=await env.MODELS.put(KEY,JSON.stringify({landmarks}),{onlyIf:data.version===null?{etagDoesNotMatch:'*'}:{etagMatches:data.version},httpMetadata:{contentType:'application/json'}});
  return object?reply({landmarks,version:object.etag}):reply({error:'設定已被其他人更新，請重新載入後再修改'},409);
}

export function landmarkClient(viewer, Cesium, role, cancelMeasure, project) {
  const endpoint = '/api/landmarks?project=' + encodeURIComponent(project.id);
  const panel=document.createElement('section');
  panel.className='tool-panel';
  panel.style.cssText='left:auto;right:18px;bottom:130px;max-height:40vh;overflow:auto;width:280px';
  panel.innerHTML='<strong>三維標的</strong><div class="landmark-list"></div><button class="reload" type="button">重新載入標的</button><p role="status" class="message"></p>';
  panel.querySelector('strong').textContent = project.name + '・三維標的';
  document.body.append(panel);
  const list=panel.querySelector('.landmark-list'),message=panel.querySelector('.message');
  let points=[],version=null,entities=[],placing=null,dirty=false,busy=false;
  const action=(title,callback)=>{const b=document.createElement('button');b.type='button';b.textContent=title;b.onclick=callback;return b;};
  function draw(){
    entities.forEach(e=>viewer.entities.remove(e));entities=[];list.replaceChildren();
    points.forEach(p=>{
      const entity=viewer.entities.add({position:Cesium.Cartesian3.fromDegrees(p.longitude,p.latitude,p.height),point:{pixelSize:9,color:Cesium.Color.CYAN},label:{text:p.name,font:'20px sans-serif',showBackground:true,pixelOffset:new Cesium.Cartesian2(0,-24)}});entities.push(entity);
      const row=document.createElement('div');
      row.append(action(p.name,()=>{viewer.flyTo(entity);message.textContent=p.name+'：'+p.description;}));
      if(role==='admin'){
        row.append(action('移動',()=>{if(busy)return;cancelMeasure();placing=p;message.textContent='點選模型上的新位置';}));
        row.append(action('編輯',()=>{if(busy)return;const name=prompt('標的名稱',p.name);if(!name?.trim())return;const description=prompt('說明',p.description);if(description===null)return;p.name=name.slice(0,80);p.description=description.slice(0,1000);dirty=true;draw();}));
        row.append(action('刪除',()=>{if(busy||!confirm('刪除「'+p.name+'」？儲存後生效。'))return;points=points.filter(x=>x.id!==p.id);dirty=true;draw();}));
      }
      list.append(row);
    });viewer.scene.requestRender();
  }
  async function reload(){
    if(busy||dirty&&!confirm('放棄尚未儲存的修改？'))return;
    busy=true;placing=null;
    try{const r=await fetch(endpoint,{cache:'no-store'});if(!r.ok)throw Error('讀取失敗，請重新登入');const d=await r.json();points=d.landmarks;version=d.version;dirty=false;draw();message.textContent='已讀取共 '+points.length+' 個標的';}catch(e){message.textContent=e.message;}finally{busy=false;}
  }
  panel.querySelector('.reload').onclick=reload;
  if(role==='admin'){
    panel.append(action('新增標的',()=>{if(busy)return;cancelMeasure();placing={id:crypto.randomUUID()};message.textContent='請點選模型表面';}));
    panel.append(action('取消定位',()=>{placing=null;message.textContent='已取消定位';}));
    panel.append(action('儲存標的',async()=>{
      if(busy)return;busy=true;placing=null;
      try{const r=await fetch(endpoint,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({landmarks:points,version})});const d=await r.json();if(!r.ok)throw Error(d.error);version=d.version;dirty=false;message.textContent='已儲存，一般觀看者可重新載入取得設定';}catch(e){message.textContent=e.message;}finally{busy=false;}
    }));
    const handler=new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(event=>{
      if(!placing||busy)return;
      const picked=viewer.scene.pick(event.position);
      if(!picked||!viewer.scene.pickPositionSupported)return;
      const position=viewer.scene.pickPosition(event.position);if(!position)return;
      const c=Cesium.Cartographic.fromCartesian(position);
      if(!placing.name){const name=prompt('標的名稱');if(!name?.trim()){placing=null;return;}placing.name=name.slice(0,80);placing.description='';points.push(placing);}
      Object.assign(placing,{longitude:Cesium.Math.toDegrees(c.longitude),latitude:Cesium.Math.toDegrees(c.latitude),height:c.height+0.3});placing=null;dirty=true;draw();message.textContent='位置已調整，請按儲存標的';
    },Cesium.ScreenSpaceEventType.LEFT_CLICK);
    window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  }
  void reload();
}

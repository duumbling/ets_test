'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const S = {
    graph: null, nodes: [], nodesById: new Map(), adj: new Map(),
    start: 'berlin', end: 'paris', via: [], route: [],
    zoom: 1, panX: 0, panY: 0, width: 0, height: 0, dpr: 1,
    dragging: false, dragFrom: null, moved: false, pointer: null, live: null,
    ws: null, relayUrl: localStorage.getItem('ets2-relay-url') || (window.ETS2_NAV_CONFIG?.relayUrl || '')
  };
  const canvas = $('mapCanvas'), ctx = canvas.getContext('2d');
  const CODE_RE = /^[A-HJ-NP-Z2-9]{12}$/;

  function status(label, online = false, hint = '') {
    $('connectionLabel').textContent = label;
    $('connectionPill').classList.toggle('online', online);
    if (hint) $('connectionHint').textContent = hint;
  }
  function neighbors(node) { return S.adj.get(node) || []; }
  function shortest(a,b) {
    if (!S.nodesById.has(a) || !S.nodesById.has(b)) return null;
    const dist = new Map(S.nodes.map(n => [n.id, Infinity]));
    const prev = new Map(), waiting = new Set(S.nodes.map(n => n.id));
    dist.set(a, 0);
    while (waiting.size) {
      let u, smallest = Infinity;
      for (const id of waiting) if (dist.get(id) < smallest) { u = id; smallest = dist.get(id); }
      if (!u || smallest === Infinity) break;
      waiting.delete(u);
      if (u === b) break;
      for (const [v,weight] of neighbors(u)) {
        const d = smallest + weight;
        if (waiting.has(v) && d < dist.get(v)) { dist.set(v,d); prev.set(v,u); }
      }
    }
    if (dist.get(b) === Infinity) return null;
    const route = [b]; let p=b;
    while (p !== a) { p=prev.get(p); if (!p) return null; route.unshift(p); }
    return route;
  }
  function buildRoute() {
    const stops = [S.start, ...S.via, S.end].filter(Boolean);
    const full=[];
    for(let i=1;i<stops.length;i++) {
      const part=shortest(stops[i-1],stops[i]);
      if(!part) { S.route=[]; $('routeStats').textContent='Нет пути между точками'; render(); return; }
      full.push(...(i===1?part:part.slice(1)));
    }
    S.route=full;
    const count=Math.max(full.length-1,0);
    $('routeStats').textContent=`${count} участков · ${Math.max(stops.length-2,0)} через точек`;
    $('routeType').textContent=S.graph?.coordinateSystem==='demo'?'Схема · не километры':'Дороги ETS2';
    localStorage.setItem('ets2-plan',JSON.stringify({start:S.start,end:S.end,via:S.via}));
    render();
  }
  function makeOption(n) { const opt=document.createElement('option'); opt.value=n.id; opt.textContent=n.name; return opt; }
  function populate() {
    for (const id of ['startSelect','finishSelect']) { const select=$(id); select.replaceChildren(...S.nodes.map(makeOption)); }
    $('startSelect').value=S.start; $('finishSelect').value=S.end;
    refreshWaypoints();
  }
  function refreshWaypoints() {
    const container=$('waypoints'); container.replaceChildren();
    S.via.forEach((v,i)=>{
      const outer=document.createElement('div'); outer.className='waypoint-row';
      const route=document.createElement('div'); route.className='route-input';
      const icon=document.createElement('span'); icon.className='point-icon via-icon';
      const field=document.createElement('div');field.className='field';
      const lab=document.createElement('label');lab.textContent=`Через точку ${i+1}`;
      const select=document.createElement('select'); select.setAttribute('aria-label',`Промежуточная точка ${i+1}`);
      select.append(...S.nodes.map(makeOption)); select.value=v;
      select.addEventListener('change',e=>{S.via[i]=e.target.value;buildRoute();});
      const rem=document.createElement('button');rem.className='remove';rem.textContent='×';rem.title='Удалить точку';
      rem.addEventListener('click',()=>{S.via.splice(i,1);refreshWaypoints();buildRoute();});
      field.append(lab,select); route.append(icon,field);outer.append(route,rem); container.append(outer);
    });
  }
  function resize() {
    const rect=canvas.getBoundingClientRect();
    S.width=rect.width; S.height=rect.height;S.dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(rect.width*S.dpr);canvas.height=Math.round(rect.height*S.dpr);
    ctx.setTransform(S.dpr,0,0,S.dpr,0,0);render();
  }
  function bounds(){const xs=S.nodes.map(n=>n.x), zs=S.nodes.map(n=>n.z);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
    return {cx:(minX+maxX)/2,cz:(minZ+maxZ)/2,scale:Math.max(.01,Math.min((S.width-110)/(maxX-minX||1),(S.height-200)/(maxZ-minZ||1)))};
  }
  function toScreen(x,z){ const b=bounds(),s=b.scale*S.zoom;return {x:S.width/2+S.panX+(x-b.cx)*s,y:S.height/2+S.panY+(z-b.cz)*s}; }
  function drawLine(points,color,width,dash=[]) {
    if(points.length<2)return;
    ctx.beginPath();points.forEach((n,i)=>{const p=toScreen(n.x,n.z);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});
    ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=width;ctx.setLineDash(dash);ctx.strokeStyle=color;ctx.stroke();ctx.setLineDash([]);
  }
  function render() {
    if(!S.graph||!S.width||!S.height)return;
    const W=S.width,H=S.height;
    ctx.clearRect(0,0,W,H);
    const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#0a1723');g.addColorStop(.55,'#0e1d2b');g.addColorStop(1,'#0a1521');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    // grid is decorative and is NOT a geographical base map.
    ctx.strokeStyle='#172b37';ctx.lineWidth=.6;
    for(let x=0;x<W;x+=52){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=52){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    for(const edge of S.graph.edges){const a=S.nodesById.get(edge[0]),b=S.nodesById.get(edge[1]);if(a&&b)drawLine([a,b],'#344f60',3);}
    const routeNodes=S.route.map(id=>S.nodesById.get(id)).filter(Boolean);
    if(routeNodes.length>1){ctx.shadowColor='#45e0a7';ctx.shadowBlur=15;drawLine(routeNodes,'#6de2b0',5);ctx.shadowBlur=0;}
    const marked=new Set([S.start,S.end,...S.via]);
    for(const n of S.nodes){
      const p=toScreen(n.x,n.z);
      if(p.x < -100||p.x>W+100||p.y < -100||p.y>H+100)continue;
      const selected=marked.has(n.id),isStart=n.id===S.start,isEnd=n.id===S.end;
      ctx.beginPath();ctx.arc(p.x,p.y,selected?9:5,0,Math.PI*2);
      ctx.fillStyle=isStart?'#6de2b0':isEnd?'#ffa976':selected?'#82bef7':'#789ab1';ctx.fill();
      ctx.lineWidth=2;ctx.strokeStyle='#0d1a28';ctx.stroke();
      ctx.font=`${selected?'650 ':''}12px system-ui`;ctx.fillStyle=selected?'#edfafa':'#a9bdc9';
      ctx.textAlign='left';ctx.fillText(n.name,p.x+13,p.y-8);
    }
    if(S.graph.coordinateSystem==='ets2'&&S.live&&Number.isFinite(S.live.x)&&Number.isFinite(S.live.z)){
      const p=toScreen(S.live.x,S.live.z);ctx.save();ctx.translate(p.x,p.y);
      ctx.rotate((S.live.heading||0)*Math.PI*2);ctx.fillStyle='#fdf8b8';ctx.strokeStyle='#183036';ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(0,-14);ctx.lineTo(10,11);ctx.lineTo(0,7);ctx.lineTo(-10,11);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    }
  }
  function nearestCity(screenX,screenY) {
    let id=null,d=20;
    for(const n of S.nodes){const p=toScreen(n.x,n.z),dd=Math.hypot(screenX-p.x,screenY-p.y);if(dd<d){id=n.id;d=dd;}}
    return id;
  }
  function onPointerDown(e){canvas.setPointerCapture(e.pointerId);S.dragging=true;S.moved=false;S.dragFrom={x:e.clientX,y:e.clientY,px:S.panX,py:S.panY};}
  function onPointerMove(e){if(!S.dragging)return;const dx=e.clientX-S.dragFrom.x,dy=e.clientY-S.dragFrom.y;
    if(Math.hypot(dx,dy)>5)S.moved=true;S.panX=S.dragFrom.px+dx;S.panY=S.dragFrom.py+dy;render();}
  function onPointerUp(e){if(!S.dragging)return;S.dragging=false;if(S.moved)return;
    const r=canvas.getBoundingClientRect();const id=nearestCity(e.clientX-r.left,e.clientY-r.top);
    if(id){S.end=id;$('finishSelect').value=id;buildRoute();}}
  function zoom(by,p){ const old=S.zoom,newZoom=Math.max(.3,Math.min(5,old*by));const k=newZoom/old;
    const cx=p?.x??S.width/2,cy=p?.y??S.height/2;
    S.panX=cx-S.width/2-(cx-S.width/2-S.panX)*k;
    S.panY=cy-S.height/2-(cy-S.height/2-S.panY)*k;
    S.zoom=newZoom;render(); }

  function disconnect(){if(S.ws){const old=S.ws;S.ws=null;old.onclose=null;old.close();}}
  function connect(){
    disconnect();
    const code=$('sessionCode').value.toUpperCase().replace(/\s/g,'');$('sessionCode').value=code;
    const url=($('relayUrl').value||S.relayUrl).trim();
    if(!CODE_RE.test(code)){status('Неверный код',false,'Введите 12 символов, которые показывает программа-мост на ПК.');return;}
    if(!url.startsWith('wss://')){status('Нет сервера',false,'Сначала укажите wss://-адрес своего сервера в настройках.');return;}
    status('Подключаемся…',false);
    let ws;
    try {ws=new WebSocket(`${url.replace(/\/$/,'')}/ws?role=viewer&code=${encodeURIComponent(code)}`);}catch(e){status('Ошибка адреса',false,String(e));return;}
    S.ws=ws;
    ws.onopen=()=>{if(S.ws===ws)status('Ожидание ETS2',false,'Соединение установлено. Ожидаем программу-мост на ПК.');};
    ws.onmessage=e=>{if(S.ws!==ws)return;let m;try{m=JSON.parse(e.data);}catch{return;}
      if(m.type==='status'){status(m.senderOnline?'Игра подключена':'Ожидание ETS2',Boolean(m.senderOnline),m.senderOnline?'Получаем данные из ETS2.':'Сайт подключён к серверу, но мост на ПК не запущен.');}
      if(m.type==='telemetry'){
        S.live=m;
        $('speed').textContent=Number.isFinite(m.speedKmh)?Math.round(m.speedKmh):'—';
        $('coord').textContent=Number.isFinite(m.x)&&Number.isFinite(m.z)?`${Math.round(m.x)} / ${Math.round(m.z)}`:'—';
        $('liveHint').textContent=S.graph.coordinateSystem==='demo'?'Данные получены! Для отображения грузовика на карте нужен настоящий граф ETS2.':'Положение грузовика обновляется на карте.';
        status('Игра подключена',true);render();
      }
    };
    ws.onerror=()=>{if(S.ws===ws)status('Ошибка соединения',false,'Проверьте адрес Cloudflare Worker и доступность сети.');};
    ws.onclose=()=>{if(S.ws===ws)status('Отключено',false,'Соединение прервано. Подключитесь снова.');};
  }

  async function init(){
    $('relayUrl').value=S.relayUrl;
    try{
      const resp=await fetch('./data/map.json');if(!resp.ok)throw new Error(`HTTP ${resp.status}`);
      S.graph=await resp.json();
      if(!['demo','ets2'].includes(S.graph.coordinateSystem))throw new Error('Неизвестная система координат');
      S.nodes=S.graph.nodes.filter(n=>typeof n.id==='string'&&typeof n.name==='string'&&Number.isFinite(n.x)&&Number.isFinite(n.z));
      if(S.nodes.length<2)throw new Error('Недостаточно узлов карты');
      S.nodesById=new Map(S.nodes.map(n=>[n.id,n]));S.adj=new Map(S.nodes.map(n=>[n.id,[]]));
      for(const [a,b] of S.graph.edges){const u=S.nodesById.get(a),v=S.nodesById.get(b);if(!u||!v)continue;
        const d=Math.hypot(u.x-v.x,u.z-v.z);S.adj.get(a).push([b,d]);S.adj.get(b).push([a,d]);}
      const p=JSON.parse(localStorage.getItem('ets2-plan')||'null');
      S.start=S.nodesById.has(p?.start)?p.start:S.nodes[0].id;
      S.end=S.nodesById.has(p?.end)?p.end:S.nodes[Math.min(S.nodes.length-1,1)].id;
      S.via=Array.isArray(p?.via)?p.via.filter(id=>S.nodesById.has(id)).slice(0,8):[];
      populate();resize();buildRoute();
      $('mapState').textContent=S.graph.coordinateSystem==='demo'?'ДЕМО-КАРТА':'ДАННЫЕ ETS2';
      $('mapState').classList.toggle('real',S.graph.coordinateSystem==='ets2');
      $('mapTitle').textContent=S.graph.title||'Маршруты ETS2';
      $('mapNotice').textContent=S.graph.notice||'';
    }catch(error){$('mapNotice').textContent='Не удалось загрузить карту: '+error.message+'. Открывайте сайт через HTTP/HTTPS, а не file://';console.error(error);}
  }
  $('startSelect').addEventListener('change',e=>{S.start=e.target.value;buildRoute();});
  $('finishSelect').addEventListener('change',e=>{S.end=e.target.value;buildRoute();});
  $('addWaypoint').addEventListener('click',()=>{if(!S.nodes.length||S.via.length>=8)return;S.via.push(S.end);refreshWaypoints();buildRoute();});
  $('swapRoute').addEventListener('click',()=>{[S.start,S.end]=[S.end,S.start];$('startSelect').value=S.start;$('finishSelect').value=S.end;S.via.reverse();refreshWaypoints();buildRoute();});
  $('copyRoute').addEventListener('click',async()=>{
    const names=ids=>ids.map(id=>S.nodesById.get(id)?.name||id);
    const output=JSON.stringify({start:S.start,via:S.via,destination:S.end,path:S.route,stops:names([S.start,...S.via,S.end]),coordinateSystem:S.graph?.coordinateSystem},null,2);
    try{await navigator.clipboard.writeText(output);$('copyRoute').textContent='Скопировано ✓';}
    catch{window.prompt('Скопируйте JSON маршрута:',output);}
    setTimeout(()=>$('copyRoute').textContent='Скопировать маршрут',1500);
  });
  $('connectBtn').addEventListener('click',connect);
  $('sessionCode').addEventListener('keydown',e=>{if(e.key==='Enter')connect();});
  $('saveRelay').addEventListener('click',()=>{const v=$('relayUrl').value.trim().replace(/\/$/,'');if(v&&!v.startsWith('wss://')){status('Неверный адрес',false,'Сервер должен начинаться с wss://');return;}S.relayUrl=v;localStorage.setItem('ets2-relay-url',v);status('Адрес сохранён',false,'Теперь можно вводить код подключения.');});
  $('zoomIn').addEventListener('click',()=>zoom(1.25));$('zoomOut').addEventListener('click',()=>zoom(1/1.25));
  $('resetView').addEventListener('click',()=>{S.zoom=1;S.panX=0;S.panY=0;render();});
  canvas.addEventListener('pointerdown',onPointerDown);canvas.addEventListener('pointermove',onPointerMove);canvas.addEventListener('pointerup',onPointerUp);
  canvas.addEventListener('pointercancel',()=>{S.dragging=false;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(e.deltaY<0?1.12:1/1.12,{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});
  new ResizeObserver(resize).observe(canvas);init();
})();

'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const S = {
    graph: null, realPack: null, roadCache: null, roadVectors: null, cityDetail: null, routeMeters: 0, nodes: [], pois: [], poiIndex: null, visiblePois: [], nodesById: new Map(), adj: new Map(),
    start: 'berlin', end: 'paris', via: [], route: [],
    zoom: 1, panX: 0, panY: 0, width: 0, height: 0, dpr: 1,
    dragging: false, dragFrom: null, moved: false, pointer: null, live: null,
    ws: null, connectionMode: localStorage.getItem('ets2-mode') || 'lan',
    lanUrl: localStorage.getItem('ets2-lan-url') || 'ws://127.0.0.1:8765',
    relayUrl: localStorage.getItem('ets2-relay-url') || (window.ETS2_NAV_CONFIG?.relayUrl || '')
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
    if (S.realPack) {
      const start=S.nodesById.get(a)?.roadNode, end=S.nodesById.get(b)?.roadNode;
      return window.ETS2RoutePack.shortest(S.realPack.adj,start,end);
    }
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
    return {path:route,meters:0};
  }
  function buildRoute() {
    const stops = [S.start, ...S.via, S.end].filter(Boolean);
    const full=[];let meters=0;
    for(let i=1;i<stops.length;i++) {
      const part=shortest(stops[i-1],stops[i]);
      if(!part) { S.route=[]; S.routeMeters=0; $('routeStats').textContent='Нет пути между точками'; render(); return; }
      full.push(...(i===1?part.path:part.path.slice(1)));
      meters+=part.meters;
    }
    S.route=full;S.routeMeters=meters;
    const count=Math.max(full.length-1,0);
    $('routeStats').textContent=S.realPack
      ? `${(meters/1000).toFixed(1)} км по графу · ${count} участков`
      : `${count} участков · ${Math.max(stops.length-2,0)} через точек`;
    $('routeType').textContent=S.realPack?'Приблизительный маршрут':S.graph?.coordinateSystem==='demo'?'Схема · не километры':'Дороги ETS2';
    localStorage.setItem('ets2-plan',JSON.stringify({start:S.start,end:S.end,via:S.via}));
    render();
  }
  function makeOption(n) {
    const opt=document.createElement('option');opt.value=n.id;
    const category=n.category?window.ETS2POI.categories[n.category]:null;
    opt.textContent=(category?category.label+' · ':'')+n.name;
    return opt;
  }
  function selectOptions(ids,current) {
    const entries=S.nodes.slice();
    const selected=S.nodesById.get(current);
    if(selected?.category)entries.push(selected);
    $(ids).replaceChildren(...entries.map(makeOption));
    $(ids).value=current;
  }
  function populate() {
    selectOptions('startSelect',S.start);
    selectOptions('finishSelect',S.end);
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
      select.append(...S.nodes.map(makeOption));
      if(S.nodesById.get(v)?.category)select.append(makeOption(S.nodesById.get(v)));
      select.value=v;
      select.addEventListener('change',e=>{S.via[i]=e.target.value;buildRoute();});
      const rem=document.createElement('button');rem.className='remove';rem.textContent='×';rem.title='Удалить точку';
      rem.addEventListener('click',()=>{S.via.splice(i,1);refreshWaypoints();buildRoute();});
      field.append(lab,select); route.append(icon,field);outer.append(route,rem); container.append(outer);
    });
  }
  function choosePoi(poi) {
    if(!poi)return;
    S.end=poi.id;
    selectOptions('finishSelect',S.end);
    centerOn(poi, 90);
    buildRoute();
  }
  function updatePoiResults() {
    const list=$('poiResults'),count=$('poiCount');
    list.replaceChildren();
    const filter=$('poiCategory').value||'all';
    const query=$('poiSearch').value.trim().toLocaleLowerCase('ru');
    const matching=S.pois.filter(p=>{
      const info=window.ETS2POI?.categories[p.category];
      return (filter==='all'||p.category===filter)&&
        (!query||p.name.toLocaleLowerCase('ru').includes(query)||
         info?.label.toLocaleLowerCase('ru').includes(query));
    });
    count.textContent=S.pois.length
      ? 'Найдено: '+matching.length+' · всего объектов: '+S.pois.length+'. Маршрут до ближайшего дорожного узла объекта.'
      : 'В этом файле нет объектов. Создай новый JSON через --repack-only.';
    for(const poi of matching.slice(0,30)){
      const button=document.createElement('button');
      button.type='button';button.className='poi-result';
      const cat=window.ETS2POI.categories[poi.category];
      const dot=document.createElement('span');
      dot.className='poi-symbol';dot.style.background=cat.color;dot.textContent=cat.symbol;
      const label=document.createElement('span');label.className='poi-result-label';
      const title=document.createElement('strong');title.textContent=poi.name;
      const subtitle=document.createElement('small');
      subtitle.textContent=cat.label+' · '+Math.round(poi.x)+' / '+Math.round(poi.z)+
        (poi.approximate?' · приблизительный подъезд':'');
      label.append(title,subtitle);button.append(dot,label);
      button.addEventListener('click',()=>choosePoi(poi));
      list.append(button);
    }
    if(matching.length>30){
      const hint=document.createElement('p');hint.className='hint';
      hint.textContent='Показаны первые 30. Уточни категорию или название.';
      list.append(hint);
    }
  }
  function centerOn(point,requestedZoom=90){
    if(!point)return;
    const b=bounds();
    S.zoom=Math.min(S.realPack?360:12,Math.max(S.zoom,requestedZoom));
    $('zoomInfo').textContent='Масштаб '+Math.round(S.zoom)+'×';
    const scale=b.scale*S.zoom;
    S.panX=-(point.x-b.cx)*scale;S.panY=-(point.z-b.cz)*scale;
    render();
  }
  function showSelectedCity(){
    const target=S.nodesById.get(S.end)||S.nodesById.get(S.start)||S.nodes[0];
    if(!target)return;
    const b=bounds();
    // Roughly 5000m of game-world horizontal span, enough to show a city.
    const cityZoom=S.realPack
      ?Math.max(25,Math.min(320,(S.width-100)/(5000*b.scale)))
      :6;
    centerOn(target,cityZoom);
  }
  function viewRect(){
    const b=bounds(),scale=b.scale*S.zoom;
    const left=S.width/2+S.panX,top=S.height/2+S.panY;
    return {minX:b.cx+(-30-left)/scale,maxX:b.cx+(S.width+30-left)/scale,
      minZ:b.cz+(-30-top)/scale,maxZ:b.cz+(S.height+30-top)/scale,
      left,top,cx:b.cx,cz:b.cz,scale};
  }
  function resize() {
    const rect=canvas.getBoundingClientRect();
    S.width=rect.width; S.height=rect.height;S.dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(rect.width*S.dpr);canvas.height=Math.round(rect.height*S.dpr);
    ctx.setTransform(S.dpr,0,0,S.dpr,0,0);render();
  }
  function bounds(){
    if (S.realPack) {
      const b=S.realPack.bounds;
      return {...b,scale:Math.max(.00001,Math.min((S.width-110)/b.dx,(S.height-200)/b.dz))};
    }
    const xs=S.nodes.map(n=>n.x), zs=S.nodes.map(n=>n.z);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
    return {cx:(minX+maxX)/2,cz:(minZ+maxZ)/2,scale:Math.max(.01,Math.min((S.width-110)/(maxX-minX||1),(S.height-200)/(maxZ-minZ||1)))};
  }
  function toScreen(x,z){ const b=bounds(),s=b.scale*S.zoom;return {x:S.width/2+S.panX+(x-b.cx)*s,y:S.height/2+S.panY+(z-b.cz)*s}; }
  function drawLine(points,color,width,dash=[]) {
    if(points.length<2)return;
    ctx.beginPath();points.forEach((n,i)=>{const p=toScreen(n.x,n.z);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});
    ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=width;ctx.setLineDash(dash);ctx.strokeStyle=color;ctx.stroke();ctx.setLineDash([]);
  }
  let renderQueued = false;
  function render() {
    if(renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; paint(); });
  }
  function paint() {
    if(!S.graph||!S.width||!S.height)return;
    const W=S.width,H=S.height;
    ctx.clearRect(0,0,W,H);
    const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#0a1723');g.addColorStop(.55,'#0e1d2b');g.addColorStop(1,'#0a1521');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    // grid is decorative and is NOT a geographical base map.
    ctx.strokeStyle='#172b37';ctx.lineWidth=.6;
    for(let x=0;x<W;x+=52){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=52){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    if(S.realPack && S.zoom>=6 && !S.roadVectors && window.ETS2VectorRoads) {
      try {
        S.roadVectors=window.ETS2VectorRoads.indexSegments(S.realPack.points,S.realPack.roads);
      } catch(error){console.warn('High zoom road index could not be built',error);}
    }
    if (S.realPack && S.zoom>=6 && S.cityDetail) {
      S.cityDetail.draw(ctx,viewRect());
    } else if (S.realPack && S.zoom>=6 && S.roadVectors) {
      S.roadVectors.draw(ctx,viewRect(),'#496779',S.zoom>80?3.5:2.6);
    } else if (S.roadCache) {
      // Rasterized road layer: a single cropped drawImage instead of ~200k
      // individual road segments on every mousemove or telemetry update.
      const bounds = S.realPack.bounds;
      S.roadCache.draw(ctx, Math.max(.00001,Math.min((W-110)/bounds.dx,(H-200)/bounds.dz))*S.zoom,
        W/2+S.panX, H/2+S.panY, bounds.cx, bounds.cz, W, H);
    } else if (S.realPack) {
      // Graceful fallback if the browser cannot allocate a cached map canvas.
      const b=bounds(), factor=b.scale*S.zoom, left=W/2+S.panX, top=H/2+S.panY;
      const points=S.realPack.points;ctx.strokeStyle='#355266';ctx.lineWidth=1.5;ctx.beginPath();
      for (const [ia,ib] of S.realPack.roads) {
        const a=points[ia], c=points[ib];
        const ax=left+(a[0]-b.cx)*factor, ay=top+(a[1]-b.cz)*factor;
        const bx=left+(c[0]-b.cx)*factor, by=top+(c[1]-b.cz)*factor;
        if(Math.max(ax,bx)<-10||Math.min(ax,bx)>W+10||Math.max(ay,by)<-10||Math.min(ay,by)>H+10)continue;
        ctx.moveTo(ax,ay);ctx.lineTo(bx,by);
      }
      ctx.stroke();
    } else {
      for(const edge of S.graph.edges){const a=S.nodesById.get(edge[0]),b=S.nodesById.get(edge[1]);if(a&&b)drawLine([a,b],'#344f60',3);}
    }
    const routeNodes=(S.realPack?S.route.map(i=>{
      const p=S.realPack.points[i];return p?{x:p[0],z:p[1]}:null;
    }):S.route.map(id=>S.nodesById.get(id))).filter(Boolean);
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
    S.visiblePois=[];
    if(S.realPack&&S.poiIndex&&S.zoom>=1.8){
      const b=bounds(),factor=b.scale*S.zoom;
      const left=W/2+S.panX, top=H/2+S.panY;
      const minX=b.cx+(-30-left)/factor,maxX=b.cx+(W+30-left)/factor;
      const minZ=b.cz+(-30-top)/factor,maxZ=b.cz+(H+30-top)/factor;
      const category=$('poiCategory').value||'all';
      S.visiblePois=S.poiIndex.within(minX,minZ,maxX,maxZ,category,900);
      ctx.save();
      for(const poi of S.visiblePois){
        const p=toScreen(poi.x,poi.z);
        const meta=window.ETS2POI.categories[poi.category];
        const selected=poi.id===S.end||poi.id===S.start||S.via.includes(poi.id);
        ctx.beginPath();ctx.arc(p.x,p.y,selected?9:5,0,Math.PI*2);
        ctx.fillStyle=meta.color;ctx.fill();
        ctx.lineWidth=selected?3:1.5;ctx.strokeStyle=selected?'#ffffff':'#0a1723';ctx.stroke();
        if(selected){
          ctx.font='bold 12px system-ui';ctx.textAlign='left';ctx.fillStyle='#f6fbff';
          ctx.fillText(poi.name,p.x+13,p.y-8);
        }
      }
      ctx.restore();
    }
    const selectedPoi=S.nodesById.get(S.end);
    if(selectedPoi?.category&&!S.visiblePois.some(p=>p.id===selectedPoi.id)){
      const p=toScreen(selectedPoi.x,selectedPoi.z);
      if(p.x>=-20&&p.x<=W+20&&p.y>=-20&&p.y<=H+20){
        ctx.beginPath();ctx.arc(p.x,p.y,10,0,Math.PI*2);
        ctx.fillStyle='#ffa976';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
        ctx.fillStyle='#fff';ctx.textAlign='left';ctx.font='bold 12px system-ui';
        ctx.fillText(selectedPoi.name,p.x+14,p.y-8);
      }
    }
    if(S.realPack&&S.live&&Number.isFinite(S.live.x)&&Number.isFinite(S.live.z)){
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
    const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
    let bestPoi=null,bestDistance=16;
    for(const poi of S.visiblePois){
      const p=toScreen(poi.x,poi.z),dist=Math.hypot(x-p.x,y-p.y);
      if(dist<bestDistance){bestPoi=poi;bestDistance=dist;}
    }
    if(bestPoi){choosePoi(bestPoi);return;}
    const id=nearestCity(x,y);
    if(id){S.end=id;selectOptions('finishSelect',S.end);buildRoute();}}
  function zoom(by,p){ const old=S.zoom,newZoom=Math.max(.3,Math.min(S.realPack?360:12,old*by));const k=newZoom/old;
    const cx=p?.x??S.width/2,cy=p?.y??S.height/2;
    S.panX=cx-S.width/2-(cx-S.width/2-S.panX)*k;
    S.panY=cy-S.height/2-(cy-S.height/2-S.panY)*k;
    S.zoom=newZoom;
    $('zoomInfo').textContent='Масштаб '+Math.round(S.zoom)+'×';
    render(); }

  function isAllowedLanUrl(raw) {
    try {
      const url = new URL(raw);
      if (url.protocol !== 'ws:' || url.username || url.password || url.hash || url.search ||
          (url.pathname !== '/' && url.pathname !== '')) return false;
      const h = url.hostname.toLowerCase().replace(/\.$/, '');
      if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.local')) return true;
      const pieces = h.split('.');
      if (pieces.length !== 4 || pieces.some(n => !/^\d{1,3}$/.test(n) || +n > 255)) return false;
      const [a, b] = pieces.map(Number);
      return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    } catch {return false;}
  }
  function setConnectionMode() {
    S.connectionMode = $('connectionMode').value;
    localStorage.setItem('ets2-mode', S.connectionMode);
    $('lanControls').hidden = S.connectionMode !== 'lan';
    $('relaySettings').hidden = S.connectionMode !== 'relay';
    status('Не подключено', false,
      S.connectionMode === 'lan'
        ? 'Запусти на ПК: py client/lan_bridge.py. Введи адрес из программы и код сеанса.'
        : 'Для доступа через интернет нужен твой сервер Cloudflare Worker и код программы-моста.');
    disconnect();
  }
  function disconnect(){if(S.ws){const old=S.ws;S.ws=null;old.onclose=null;old.close();}}
  function connect(){
    disconnect();
    const code=$('sessionCode').value.toUpperCase().replace(/\s/g,'');$('sessionCode').value=code;
    const isLan=S.connectionMode==='lan';
    const url=(isLan?$('lanUrl').value:($('relayUrl').value||S.relayUrl)).trim().replace(/\/$/,'');
    if(!CODE_RE.test(code)){status('Неверный код',false,'Введите 12 символов, которые показывает программа-мост на ПК.');return;}
    if(isLan ? !isAllowedLanUrl(url) : !url.startsWith('wss://')){
      status('Неверный адрес',false,isLan
        ? 'Укажите локальный ws://IP:ПОРТ (например, ws://192.168.1.20:8765).'
        : 'Сначала укажите wss://-адрес своего Cloudflare Worker.');return;
    }
    if(isLan){S.lanUrl=url;localStorage.setItem('ets2-lan-url',url);}
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
        $('liveHint').textContent=S.graph?.coordinateSystem==='demo'?'Данные получены! Для отображения грузовика на карте нужен настоящий граф ETS2.':'Положение грузовика обновляется на карте.';
        status('Игра подключена',true);render();
      }
    };
    let hadError=false;
    ws.onerror=()=>{if(S.ws===ws){hadError=true;status('Ошибка соединения',false,isLan
      ? 'Проверь мост, IP, брандмауэр Windows и разрешение Chrome/Edge на локальную сеть.'
      : 'Проверь адрес Cloudflare Worker и доступность сети.');}};
    ws.onclose=()=>{if(S.ws===ws&&!hadError)status('Отключено',false,'Соединение прервано. Подключитесь снова.');};
  }

  function loadMap(input, isReal) {
    S.realPack=isReal ? window.ETS2RoutePack.normalize(input) : null;
    S.graph=S.realPack || input;
    S.roadCache=null;S.roadVectors=null;S.cityDetail=null;
    $('detailStatus').textContent='Подробные улицы не загружены. Выбери дополнительный файл .json.gz.';
    $('zoomInfo').textContent='Масштаб 1×';
    if (S.realPack && window.ETS2RoadCache) {
      try {
        // Reduce GPU memory consumption on phones and low-memory computers.
        const lowMemory = (navigator.deviceMemory && navigator.deviceMemory<=4) || window.innerWidth<780;
        S.roadCache=window.ETS2RoadCache.create(
          S.realPack.points, S.realPack.roads, S.realPack.bounds, lowMemory?2048:3072);
      } catch(err) { console.warn('Road cache unavailable, using vector fallback',err); }
    }
    if(!S.realPack && !['demo','ets2'].includes(S.graph.coordinateSystem)) {
      throw new Error('Неизвестная система координат');
    }
    S.nodes=(S.realPack?S.realPack.nodes:S.graph.nodes).filter(
      n=>typeof n.id==='string'&&typeof n.name==='string'&&Number.isFinite(n.x)&&Number.isFinite(n.z));
    if(S.nodes.length<2)throw new Error('Недостаточно городов на карте');
    S.pois=S.realPack?.pois||[];
    S.poiIndex=S.pois.length&&window.ETS2POI?window.ETS2POI.createIndex(S.pois):null;
    S.nodesById=new Map([...S.nodes,...S.pois].map(n=>[n.id,n]));
    S.adj=new Map(S.nodes.map(n=>[n.id,[]]));
    if(!S.realPack){
      for(const [a,b] of S.graph.edges){const u=S.nodesById.get(a),v=S.nodesById.get(b);if(!u||!v)continue;
        const d=Math.hypot(u.x-v.x,u.z-v.z);S.adj.get(a).push([b,d]);S.adj.get(b).push([a,d]);}
    }
    const saved=JSON.parse(localStorage.getItem('ets2-plan')||'null');
    S.start=S.nodesById.has(saved?.start)?saved.start:S.nodes[0].id;
    S.end=S.nodesById.has(saved?.end)?saved.end:S.nodes[1].id;
    S.via=Array.isArray(saved?.via)?saved.via.filter(id=>S.nodesById.has(id)).slice(0,8):[];
    S.zoom=1;S.panX=0;S.panY=0;
    populate();resize();buildRoute();
    updatePoiResults();
    $('mapState').textContent=S.realPack?'РЕАЛЬНЫЙ ГРАФ':'ДЕМО-КАРТА';
    $('mapState').classList.toggle('real',!!S.realPack);
    $('mapTitle').textContent=S.graph.title||'Маршруты ETS2';
    $('mapNotice').textContent=S.graph.notice||'';
    $('mapImportStatus').textContent=S.realPack
      ? `Загружено: ${S.nodes.length} городов, ${S.realPack.points.length} узлов, ${S.realPack.linkCount} направленных связей, ${S.pois.length} объектов.`
      : 'Используется демонстрационная схема. Реальная карта не загружена.';
  }
  async function loadDetailBlob(blob, isNewImport=false) {
    if(!S.realPack)throw Error('Сначала загрузи дорожную сеть ETS2 (ets2-routepack.json).');
    if(blob.size>200*1024*1024)throw Error('Подробная карта слишком большая (максимум 200 МБ).');
    const magic=new Uint8Array(await blob.slice(0,2).arrayBuffer());
    const gzip=magic[0]===0x1f&&magic[1]===0x8b;
    let raw;
    if(gzip){
      if(!window.DecompressionStream)throw Error('Для .gz нужен актуальный Chrome или Edge.');
      const response=new Response(blob.stream().pipeThrough(new DecompressionStream('gzip')));
      raw=await response.text();
    } else {
      raw=await blob.text();
    }
    const parsed=JSON.parse(raw);
    const layer=window.ETS2CityDetail.create(parsed);
    S.cityDetail=layer;
    $('detailStatus').textContent='Подробная геометрия загружена: '+layer.count+
      ' дорожных участков и территорий. Приблизь город до 6× или воспользуйся кнопкой ⌕.';
    if(isNewImport){
      const active=localStorage.getItem(ACTIVE_MAP_KEY);
      if(active&&window.ETS2MapStorage){
        try{
          await window.ETS2MapStorage.saveDetail(active,blob);
          $('detailStatus').textContent+=' Сохранено вместе с этим профилем карты.';
        }catch(err){
          console.warn('Cannot persist detailed map',err);
          $('detailStatus').textContent+=' Не удалось сохранить: '+err.message;
        }
      }else{
        $('detailStatus').textContent+=' Чтобы сохранить между сеансами, импортируй основной JSON как профиль.';
      }
    }
    render();
  }
  async function restoreDetail(id){
    S.cityDetail=null;
    if(!id||!window.ETS2MapStorage)return;
    const entry=await window.ETS2MapStorage.getDetail(id);
    if(entry?.blob)await loadDetailBlob(entry.blob,false);
  }
  const ACTIVE_MAP_KEY='ets2-active-map-profile';
  async function updateSavedMaps(activeId='') {
    const picker=$('savedMapSelect');
    picker.replaceChildren(new Option('Базовая / демо-карта', ''));
    if(!window.ETS2MapStorage) { picker.disabled=true; return; }
    try {
      const items=await window.ETS2MapStorage.list();
      for(const item of items) {
        const date=item.savedAt?new Date(item.savedAt).toLocaleDateString('ru-RU'):'';
        picker.add(new Option(item.name+' · '+item.cities+' гор. · '+date,item.id));
      }
      picker.value=items.some(item=>item.id===activeId)?activeId:'';
      $('deleteSavedMap').disabled=!picker.value;
    } catch (error) {
      console.warn('Offline map storage unavailable',error);
      picker.disabled=true;
      $('deleteSavedMap').disabled=true;
    }
  }
  async function loadDefaultMap() {
    const remote=await fetch('./data/ets2-routepack.json',{cache:'no-cache'});
    if(remote.ok) {
      loadMap(await remote.json(),true);
    } else {
      const demo=await fetch('./data/map.json');
      if(!demo.ok)throw new Error('HTTP '+demo.status);
      loadMap(await demo.json(),false);
    }
  }
  async function activateSavedMap(id) {
    if(!id) {
      await loadDefaultMap();
      localStorage.removeItem(ACTIVE_MAP_KEY);
      await updateSavedMaps('');
      return;
    }
    if(!window.ETS2MapStorage) throw new Error('Хранилище карт недоступно');
    const item=await window.ETS2MapStorage.get(id);
    if(!item?.blob)throw new Error('Сохранённый профиль карты не найден');
    loadMap(JSON.parse(await item.blob.text()),true);
    localStorage.setItem(ACTIVE_MAP_KEY,id);
    try{await restoreDetail(id);}
    catch(error){
      console.warn('Detailed map is unavailable',error);
      $('detailStatus').textContent='Не удалось восстановить подробную карту: '+error.message;
    }
    await updateSavedMaps(id);
    $('mapImportStatus').textContent+=' Сохранённая карта: «'+item.name+'» (только на этом устройстве).';
  }
  async function loadFile(e){
    const file=e.target.files?.[0];if(!file)return;
    if(file.size>70*1024*1024){$('mapImportStatus').textContent='Файл слишком большой (максимум 70 МБ).';return;}
    $('mapImportStatus').textContent='Читаю дорожный граф…';
    try {
      const parsed=JSON.parse(await file.text());
      loadMap(parsed,true);
      const label=$('mapProfileName').value.trim()||
        'ETS2 · '+S.nodes.length+' городов · '+new Date().toLocaleDateString('ru-RU');
      if(window.ETS2MapStorage) {
        const id='map-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
        try {
          await window.ETS2MapStorage.save({
            id,name:label,blob:file,cities:S.nodes.length,savedAt:Date.now()
          });
          localStorage.setItem(ACTIVE_MAP_KEY,id);
          await updateSavedMaps(id);
          $('mapImportStatus').textContent+=
            ' Карта сохранена в браузере и будет открываться автоматически.';
        } catch(error) {
          console.warn('Map loaded but not saved in the browser',error);
          $('mapImportStatus').textContent+=
            ' Карта загружена, но не сохранена: '+error.message;
        }
      } else {
        $('mapImportStatus').textContent+=' В этом браузере автоматическое сохранение недоступно.';
      }
    }catch(error){$('mapImportStatus').textContent='Ошибка загрузки: '+error.message;console.error(error);}
    e.target.value='';
  }
  async function init(){
    $('relayUrl').value=S.relayUrl;
    $('lanUrl').value=S.lanUrl;
    $('connectionMode').value=S.connectionMode==='relay'?'relay':'lan';
    S.connectionMode=$('connectionMode').value;
    setConnectionMode();
    const active=localStorage.getItem(ACTIVE_MAP_KEY);
    if(active&&window.ETS2MapStorage) {
      try {
        await activateSavedMap(active);
        return;
      } catch(error) {
        console.warn('Unable to restore offline map, loading bundled map',error);
        localStorage.removeItem(ACTIVE_MAP_KEY);
      }
    }
    try {
      await loadDefaultMap();
      await updateSavedMaps('');
    }catch(error) {
      $('mapNotice').textContent='Не удалось загрузить карту: '+error.message+
        '. Открывайте сайт через HTTP/HTTPS, а не file://';
      console.error(error);
    }
  }
  $('poiCategory').addEventListener('change',()=>{updatePoiResults();render();});
  $('poiSearch').addEventListener('input',updatePoiResults);
  $('detailFile').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    $('detailStatus').textContent='Загружаю подробную карту города…';
    try{await loadDetailBlob(file,true);}
    catch(error){$('detailStatus').textContent='Ошибка подробной карты: '+error.message;console.error(error);}
    event.target.value='';
  });
  $('mapFile').addEventListener('change',loadFile);
  $('savedMapSelect').addEventListener('change',async e=>{
    try {
      $('mapImportStatus').textContent='Открываю сохранённую карту…';
      await activateSavedMap(e.target.value);
    } catch(error) {
      $('mapImportStatus').textContent='Не удалось переключить карту: '+error.message;
      console.error(error);
    }
  });
  $('deleteSavedMap').addEventListener('click',async()=>{
    const picker=$('savedMapSelect'),id=picker.value;
    if(!id||!window.ETS2MapStorage) return;
    const name=picker.selectedOptions[0]?.textContent||'карту';
    if(!confirm('Удалить «'+name+'» из этого браузера? Исходный JSON-файл останется у вас на компьютере.')) return;
    try {
      await window.ETS2MapStorage.remove(id);
      if(localStorage.getItem(ACTIVE_MAP_KEY)===id) {
        localStorage.removeItem(ACTIVE_MAP_KEY);
        await loadDefaultMap();
      }
      await updateSavedMaps('');
      $('mapImportStatus').textContent+=' Профиль удалён из браузера.';
    } catch(error) {
      $('mapImportStatus').textContent='Не удалось удалить карту: '+error.message;
    }
  });
  $('startSelect').addEventListener('change',e=>{S.start=e.target.value;buildRoute();});
  $('finishSelect').addEventListener('change',e=>{S.end=e.target.value;buildRoute();});
  $('addWaypoint').addEventListener('click',()=>{if(!S.nodes.length||S.via.length>=8)return;S.via.push(S.end);refreshWaypoints();buildRoute();});
  $('swapRoute').addEventListener('click',()=>{[S.start,S.end]=[S.end,S.start];$('startSelect').value=S.start;$('finishSelect').value=S.end;S.via.reverse();refreshWaypoints();buildRoute();});
  $('copyRoute').addEventListener('click',async()=>{
    const names=ids=>ids.map(id=>S.nodesById.get(id)?.name||id);
    const output=JSON.stringify({start:S.start,via:S.via,destination:S.end,path:S.route,stops:names([S.start,...S.via,S.end]),coordinateSystem:S.graph?.coordinateSystem,routeMeters:S.realPack?S.routeMeters:null},null,2);
    try{await navigator.clipboard.writeText(output);$('copyRoute').textContent='Скопировано ✓';}
    catch{window.prompt('Скопируйте JSON маршрута:',output);}
    setTimeout(()=>$('copyRoute').textContent='Скопировать маршрут',1500);
  });
  $('connectionMode').addEventListener('change',setConnectionMode);
  $('connectBtn').addEventListener('click',connect);
  $('sessionCode').addEventListener('keydown',e=>{if(e.key==='Enter')connect();});
  $('saveRelay').addEventListener('click',()=>{const v=$('relayUrl').value.trim().replace(/\/$/,'');if(v&&!v.startsWith('wss://')){status('Неверный адрес',false,'Сервер должен начинаться с wss://');return;}S.relayUrl=v;localStorage.setItem('ets2-relay-url',v);status('Адрес сохранён',false,'Теперь можно вводить код подключения.');});
  $('zoomIn').addEventListener('click',()=>zoom(1.6));$('zoomOut').addEventListener('click',()=>zoom(1/1.6));
  $('zoomCity').addEventListener('click',showSelectedCity);
  $('resetView').addEventListener('click',()=>{S.zoom=1;S.panX=0;S.panY=0;
    $('zoomInfo').textContent='Масштаб 1×';render();});
  for(const [id,category] of Object.entries(window.ETS2POI.categories)){
    $('poiCategory').add(new Option(category.label,id));
  }
  canvas.addEventListener('dblclick',e=>{
    e.preventDefault();
    const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
    const id=nearestCity(x,y);
    if(id){S.end=id;selectOptions('finishSelect',S.end);buildRoute();showSelectedCity();}
    else zoom(3,{x,y});
  });
  canvas.addEventListener('pointerdown',onPointerDown);canvas.addEventListener('pointermove',onPointerMove);canvas.addEventListener('pointerup',onPointerUp);
  canvas.addEventListener('pointercancel',()=>{S.dragging=false;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(e.deltaY<0?1.24:1/1.24,{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});
  new ResizeObserver(resize).observe(canvas);init();
})();

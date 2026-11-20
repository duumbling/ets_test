/* ETS2 route pack support. This file is independently written, no third-party code. */
(function (root, factory) {
  'use strict';
  const lib = factory();
  root.ETS2RoutePack = lib;
  if (typeof module === 'object' && module.exports) module.exports = lib;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FORMAT = 'ets2-routepack-v1';
  function isIndex(i, len) { return Number.isInteger(i) && i >= 0 && i < len; }
  function isCoord(p) { return Array.isArray(p) && p.length === 2 && p.every(Number.isFinite); }
  function normalize(pack) {
    if (!pack || pack.format !== FORMAT || pack.coordinateSystem !== 'ets2') {
      throw new Error('Нужен JSON формата ets2-routepack-v1, созданный конвертером из ETS2.');
    }
    if (!Array.isArray(pack.points) || pack.points.length < 2 || pack.points.length > 600000 ||
        !Array.isArray(pack.links) || pack.links.length > 2400000 ||
        !Array.isArray(pack.cities) || pack.cities.length < 2 || pack.cities.length > 5000) {
      throw new Error('Некорректный размер дорожного графа или списка городов.');
    }
    const count = pack.points.length;
    for (const p of pack.points) if (!isCoord(p)) throw new Error('Некорректные координаты дороги.');
    const adj = Array.from({ length: count }, () => []);
    const roads = [], uniqueRoads = new Set();
    let linkCount = 0;
    for (const e of pack.links) {
      if (!Array.isArray(e) || e.length !== 3 || !isIndex(e[0],count) ||
          !isIndex(e[1],count) || !Number.isFinite(e[2]) || e[2] <= 0) {
        throw new Error('Некорректная связь в дорожном графе.');
      }
      if (e[0] === e[1]) continue;
      adj[e[0]].push([e[1],e[2]]);
      linkCount++;
      const key = Math.min(e[0], e[1]) + ':' + Math.max(e[0],e[1]);
      if (!uniqueRoads.has(key)) { uniqueRoads.add(key); roads.push([e[0],e[1]]); }
    }
    const seen = new Set();
    const cities = pack.cities.map(c => {
      if (!Array.isArray(c) || c.length !== 5 || typeof c[0] !== 'string' ||
          typeof c[1] !== 'string' || !Number.isFinite(c[2]) || !Number.isFinite(c[3]) ||
          !isIndex(c[4],count) || seen.has(c[0])) {
        throw new Error('Некорректный населённый пункт.');
      }
      seen.add(c[0]);
      return { id:c[0],name:c[1],x:c[2],z:c[3],roadNode:c[4] };
    });
    // Optional POIs preserve compatibility with old ETS2 routepacks.
    // Source positions are the real in-game map coordinates. Road-node
    // anchoring is approximate when the source has no explicit graph UID.
    const categories = new Set(['fuel','service','parking','weigh','dealer','garage',
      'recruitment','company','ferry','train','viewpoint','landmark']);
    if (pack.pois !== undefined && (!Array.isArray(pack.pois) || pack.pois.length>80000)) {
      throw new Error('Некорректный список объектов ETS2.');
    }
    const pois = (pack.pois||[]).map(p => {
      if (!Array.isArray(p) || p.length!==7 || typeof p[0]!=='string' ||
          p[0].length>70 || !categories.has(p[1]) || typeof p[2]!=='string' ||
          p[2].length>120 || !Number.isFinite(p[3]) || !Number.isFinite(p[4]) ||
          !isIndex(p[5],count) || (p[6]!==0 && p[6]!==1)) {
        throw new Error('Некорректный объект карты.');
      }
      return {id:p[0],category:p[1],name:p[2],x:p[3],z:p[4],
        roadNode:p[5],approximate:Boolean(p[6])};
    });
    const poiIds = new Set();
    for(const poi of pois){
      if(poiIds.has(poi.id)||seen.has(poi.id))throw new Error('Повторяющийся объект карты.');
      poiIds.add(poi.id);
    }
    return {
      title: pack.title || 'Дороги ETS2', coordinateSystem:'ets2', format:FORMAT,
      notice: 'Реальные данные узлов ETS2 (прямые отрезки между узлами). Это ещё не точный рисунок всех дорожных изгибов; дорожные ограничения на повороты упрощены.',
      nodes:cities, pois, points:pack.points, roads, adj, linkCount,
      bounds:coordinateBounds(pack.points), source:pack.source||''
    };
  }
  function coordinateBounds(points) {
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for (const [x,z] of points) {
      minX=Math.min(x,minX); maxX=Math.max(x,maxX);
      minZ=Math.min(z,minZ); maxZ=Math.max(z,maxZ);
    }
    return {cx:(minX+maxX)/2,cz:(minZ+maxZ)/2,dx:Math.max(1,maxX-minX),dz:Math.max(1,maxZ-minZ)};
  }
  // Dijkstra with a binary heap: O((V+E)log V) rather than a full node scan.
  function shortest(adj,start,end) {
    if (!isIndex(start,adj.length)||!isIndex(end,adj.length)) return null;
    if (start===end) return {path:[start],meters:0};
    const dist = new Float64Array(adj.length); dist.fill(Infinity);
    const prev = new Int32Array(adj.length); prev.fill(-1);
    const heap = [];
    function push(node,d) {
      let i=heap.length; heap.push([node,d]);
      while(i>0) {const p=(i-1)>>1;if(heap[p][1]<=d)break;heap[i]=heap[p];i=p;}
      heap[i]=[node,d];
    }
    function pop() {
      const min=heap[0], last=heap.pop();
      if(heap.length) {let i=0;while(true){let left=i*2+1;if(left>=heap.length)break;
        let right=left+1, child=right<heap.length&&heap[right][1]<heap[left][1]?right:left;
        if(heap[child][1]>=last[1])break;heap[i]=heap[child];i=child;}
        heap[i]=last;}
      return min;
    }
    dist[start]=0;push(start,0);
    while(heap.length) {
      const [u,d]=pop(); if(d>dist[u])continue;
      if(u===end)break;
      for(const [v,w] of adj[u]) {
        const next=d+w; if(next<dist[v]){dist[v]=next;prev[v]=u;push(v,next);}
      }
    }
    if(!Number.isFinite(dist[end]))return null;
    const path=[];let cur=end;
    for(let i=0;i<=adj.length;i++) {
      path.push(cur);if(cur===start){path.reverse();return {path,meters:dist[end]};}
      cur=prev[cur];if(cur<0)break;
    }
    return null;
  }
  return {FORMAT,normalize,shortest};
});

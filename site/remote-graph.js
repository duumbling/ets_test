/* An independent reader for the documented Truck Dash TDRG v2/v3 route graph.
 * https://github.com/Nethercap/truck-companion/blob/main/client/mapbuild/route_graph_bin.py
 * This is an interoperability adapter, not a copy of the upstream app.
 * Neither maps nor road graph binaries are hosted in this repository.
 */
(function (root, factory) {
  const lib=factory();
  root.ETS2RemoteGraph=lib;
  if(typeof module==='object'&&module.exports)module.exports=lib;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function parse(buffer){
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<24)throw Error('Граф отсутствует или повреждён');
  const dv=new DataView(buffer);
  if(dv.getUint32(0,true)!==0x47524454)throw Error('Это не файл TDRG');
  const version=dv.getUint32(4,true),n=dv.getUint32(8,true),
        m=dv.getUint32(12,true),nMid=dv.getUint32(16,true),
        nComp=dv.getUint32(20,true);
  if(![2,3].includes(version)||n<2||n>1000000||m>3000000||
     nMid>20000000||nComp>n)throw Error('Неподдерживаемая версия или размер графа');
  let at=24;
  function section(T,count){
    const byteSize=T.BYTES_PER_ELEMENT*count;
    if(!Number.isSafeInteger(byteSize)||at+byteSize>buffer.byteLength)
      throw Error('Файл графа обрезан');
    const view=new T(buffer,at,count);
    at+=byteSize;at=(at+3)&~3;
    return view;
  }
  const xy=section(Int32Array,2*n),
        a=section(Uint32Array,m),
        b=section(Uint32Array,m),
        distance=section(Uint32Array,m),
        seconds=section(Uint16Array,m),
        flags=section(Uint8Array,m),
        midOff=section(Uint32Array,m+1),
        midDeltas=section(Int32Array,2*nMid);
  section(Uint8Array,n);  // degree
  section(Int32Array,n);   // connected-component IDs
  section(Uint32Array,nComp);
  if(version===3){
    section(Int8Array,m);section(Int8Array,m);
    if(at+m<=buffer.byteLength)section(Uint8Array,m);
  }
  if(midOff[0]!==0||midOff[m]!==nMid)throw Error('Повреждён список изгибов дороги');
  const mids=new Int32Array(nMid*2);let x=0,y=0;
  for(let i=0;i<mids.length;i+=2){
    x+=midDeltas[i];y+=midDeltas[i+1];
    mids[i]=x;mids[i+1]=y;
  }
  const size=m*2,head=new Int32Array(n);head.fill(-1);
  const next=new Int32Array(size),to=new Uint32Array(size),
        edge=new Uint32Array(size),weights=new Uint32Array(size);
  let arcs=0;
  function add(u,v,i){
    if(u>=n||v>=n)return;
    to[arcs]=v;edge[arcs]=i;weights[arcs]=Math.max(1,distance[i]);
    next[arcs]=head[u];head[u]=arcs++;
  }
  for(let i=0;i<m;i++){
    add(a[i],b[i],i);
    if(!(flags[i]&2))add(b[i],a[i],i);
    if(midOff[i+1]<midOff[i]||midOff[i+1]>nMid)
      throw Error('Повреждена геометрия графа');
  }
  function nearest(px,py){
    let best=-1,ds=Infinity;const ax=Math.round(px*10),ay=Math.round(py*10);
    for(let i=0;i<n;i++){
      const dx=xy[2*i]-ax,dy=xy[2*i+1]-ay,d=dx*dx+dy*dy;
      if(d<ds){ds=d;best=i;}
    }
    return best;
  }
  function shortest(start,end){
    if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<0||start>=n||end>=n)
      return null;
    const dist=new Float64Array(n);dist.fill(Infinity);
    const previous=new Int32Array(n);previous.fill(-1);
    const prevEdge=new Int32Array(n);prevEdge.fill(-1);
    const heap=[];let len=0;
    function push(node,cost){
      let i=len++;while(i>0){
        const p=(i-1)>>1;if(heap[p][1]<=cost)break;
        heap[i]=heap[p];i=p;
      }heap[i]=[node,cost];
    }
    function pop(){
      const first=heap[0],last=heap[--len];
      if(len){let i=0;while(true){
        let l=2*i+1;if(l>=len)break;
        const r=l+1,c=r<len&&heap[r][1]<heap[l][1]?r:l;
        if(heap[c][1]>=last[1])break;heap[i]=heap[c];i=c;
      }heap[i]=last;}heap.length=len;return first;
    }
    dist[start]=0;push(start,0);
    while(len){
      const [u,d]=pop();if(d!==dist[u])continue;if(u===end)break;
      for(let k=head[u];k!==-1;k=next[k]){
        const v=to[k],nd=d+weights[k];
        if(nd<dist[v]){dist[v]=nd;previous[v]=u;prevEdge[v]=edge[k];push(v,nd);}
      }
    }
    if(!Number.isFinite(dist[end]))return null;
    const nodes=[],edges=[];let u=end;
    while(u!==start&&nodes.length<n){
      nodes.push(u);edges.push(prevEdge[u]);u=previous[u];
      if(u<0)return null;
    }
    nodes.push(start);nodes.reverse();edges.reverse();
    return {nodes,edges,meters:dist[end]/10};
  }
  function routeGeometry(result){
    if(!result||!result.nodes.length)return [];
    const output=[[xy[result.nodes[0]*2]/10,xy[result.nodes[0]*2+1]/10]];
    for(let i=0;i<result.edges.length;i++){
      const id=result.edges[i],from=result.nodes[i],dest=result.nodes[i+1];
      let forward=a[id]===from&&b[id]===dest;
      let begin=midOff[id],end=midOff[id+1];
      if(forward){
        for(let j=begin;j<end;j++)output.push([mids[2*j]/10,mids[2*j+1]/10]);
      }else{
        for(let j=end-1;j>=begin;j--)output.push([mids[2*j]/10,mids[2*j+1]/10]);
      }
      output.push([xy[dest*2]/10,xy[dest*2+1]/10]);
    }
    return output;
  }
  return {version,nodes:n,edges:m,arcs,nearest,shortest,routeGeometry};
}
return {parse};
});
/* ETS2 street-level renderer. Uses actual game-world roads and area polygons.
 * Both ordinary roads (kind 0) and prefab road strings (kind 3) are real road
 * geometry. Prefab polygons are painted first; connector roads are drawn above
 * them so intersections do not hide their own connecting streets.
 * v1 and v2 detail files remain readable.
 */
(function(root,factory){
  const api=factory();
  root.ETS2CityDetail=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const FORMAT='ets2-city-detail-v2',LEGACY_FORMAT='ets2-city-detail-v1';
  const CELL=2000,MAX_FEATURES=1200000;
  const clamp=(min,n,max)=>Math.max(min,Math.min(max,n));
  function normalize(pack){
    if(!pack||![FORMAT,LEGACY_FORMAT].includes(pack.format)||
      pack.coordinateSystem!=='ets2'||!Array.isArray(pack.geometry)||
      pack.geometry.length>MAX_FEATURES||pack.geometry.length<1)
      throw Error('Неверный формат подробной карты ETS2.');
    const out=[];
    const counters={roads:0,prefabLines:0,prefabSurfaces:0,areas:0};
    for(const item of pack.geometry){
      if(!Array.isArray(item)||item.length<2||item.length>3||
        ![0,1,2,3].includes(item[0])||
        (item[0]===3&&pack.format!==FORMAT)||
        !Array.isArray(item[1])||item[1].length<4||
        item[1].length>25000||item[1].length%2!==0||
        item[1].some(v=>!Number.isFinite(v)||Math.abs(v)>3000000)||
        (item.length===3&&(!Number.isFinite(item[2])||item[2]<2||item[2]>70)))
        throw Error('Некорректная геометрия детальной карты.');
      const coords=item[1],kind=item[0];
      if(kind!==0&&kind!==3&&coords.length<6)continue;
      let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
      for(let i=0;i<coords.length;i+=2){
        minX=Math.min(minX,coords[i]);maxX=Math.max(maxX,coords[i]);
        minZ=Math.min(minZ,coords[i+1]);maxZ=Math.max(maxZ,coords[i+1]);
      }
      out.push({kind,coords,minX,minZ,maxX,maxZ,width:item[2]||9});
      if(kind===0)counters.roads++;
      else if(kind===1)counters.prefabSurfaces++;
      else if(kind===2)counters.areas++;
      else counters.prefabLines++;
    }
    return {features:out,counters,isLegacy:pack.format===LEGACY_FORMAT};
  }
  function create(pack,cell=CELL){
    const {features,counters,isLegacy}=normalize(pack),buckets=new Map(),overflow=[];
    features.forEach((f,i)=>{
      const a=Math.floor(f.minX/cell),b=Math.floor(f.maxX/cell);
      const c=Math.floor(f.minZ/cell),d=Math.floor(f.maxZ/cell);
      if((b-a+1)*(d-c+1)>140){overflow.push(i);return;}
      for(let x=a;x<=b;x++)for(let z=c;z<=d;z++){
        const k=x+':'+z;
        if(!buckets.has(k))buckets.set(k,[]);
        buckets.get(k).push(i);
      }
    });
    const seen=new Uint32Array(features.length);
    let stamp=0;
    function query(minX,minZ,maxX,maxZ,limit=18000){
      const list=[],id=++stamp;
      if(stamp>=4294967294){seen.fill(0);stamp=1;}
      function add(index){
        if(seen[index]===id)return false;
        seen[index]=id;
        const f=features[index];
        if(f.maxX<minX||f.minX>maxX||f.maxZ<minZ||f.minZ>maxZ)return false;
        list.push(f);return list.length>=limit;
      }
      for(let x=Math.floor(minX/cell);x<=Math.floor(maxX/cell);x++)
        for(let z=Math.floor(minZ/cell);z<=Math.floor(maxZ/cell);z++){
          for(const index of buckets.get(x+':'+z)||[])if(add(index))return list;
        }
      for(const index of overflow)if(add(index))break;
      return list;
    }
    function draw(ctx,view){
      const list=query(view.minX,view.minZ,view.maxX,view.maxZ);
      const {left,top,cx,cz,scale}=view;
      function trace(f){
        const p=f.coords;
        ctx.moveTo(left+(p[0]-cx)*scale,top+(p[1]-cz)*scale);
        for(let i=2;i<p.length;i+=2)
          ctx.lineTo(left+(p[i]-cx)*scale,top+(p[i+1]-cz)*scale);
      }
      ctx.save();
      // Draw all filled map surfaces BEFORE the road network. The old order
      // painted prefab polygons over their own connecting road segments,
      // hiding the exact pieces needed to join streets at intersections.
      ctx.fillStyle='#203545';
      ctx.beginPath();
      for(const f of list)if(f.kind===2){trace(f);ctx.closePath();}
      ctx.fill();
      ctx.beginPath();
      for(const f of list)if(f.kind===1){trace(f);ctx.closePath();}
      ctx.fillStyle='#728695';ctx.fill();

      // Both kinds 0 and 3 are genuine road geometry. Kind 3 is generated
      // from prefab road-map points (junction interiors and connectors), not
      // debug/navigation hints. Hiding it disconnects otherwise valid roads.
      // Draw it above the prefab surface so every connector remains visible.
      const groups=new Map();
      for(const f of list){
        if(f.kind!==0&&f.kind!==3)continue;
        const px=clamp(4,Math.round(clamp(7,f.width,30)*scale*1.15),30);
        if(!groups.has(px))groups.set(px,[]);
        groups.get(px).push(f);
      }
      ctx.lineCap='round';ctx.lineJoin='round';
      for(const [width,lines] of [...groups.entries()].sort((a,b)=>b[0]-a[0])){
        ctx.beginPath();for(const f of lines)trace(f);
        ctx.lineWidth=width+2.5;ctx.strokeStyle='#182b39';ctx.stroke();
        ctx.lineWidth=width;ctx.strokeStyle='#7e909e';ctx.stroke();
      }
      ctx.restore();
      return list.length;
    }
    return {draw,query,count:features.length,counters,isLegacy};
  }
  return {FORMAT,LEGACY_FORMAT,normalize,create};
});

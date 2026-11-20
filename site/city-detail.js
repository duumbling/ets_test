/* ETS2 city detail layer. Sparse index for smooth pan/zoom at street level.
 * Accepts only compact game-coordinate geometry from local exporter.
 */
(function(root,factory){
  const api=factory();
  root.ETS2CityDetail=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const FORMAT='ets2-city-detail-v1',CELL=2000,MAX_FEATURES=1200000;
  function normalize(pack){
    if(!pack||pack.format!==FORMAT||pack.coordinateSystem!=='ets2'||
      !Array.isArray(pack.geometry)||pack.geometry.length>MAX_FEATURES||pack.geometry.length<1)
      throw Error('Неверный формат подробной карты ETS2.');
    const out=[];
    for(const item of pack.geometry){
      if(!Array.isArray(item)||item.length!==2||![0,1,2].includes(item[0])||
        !Array.isArray(item[1])||item[1].length<4||
        item[1].length>25000||item[1].length%2!==0||
        item[1].some(v=>!Number.isFinite(v)||Math.abs(v)>3000000))
        throw Error('Некорректная геометрия детальной карты.');
      const coords=item[1];
      if(item[0]!==0&&coords.length<6)continue;
      let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
      for(let i=0;i<coords.length;i+=2){
        minX=Math.min(minX,coords[i]);maxX=Math.max(maxX,coords[i]);
        minZ=Math.min(minZ,coords[i+1]);maxZ=Math.max(maxZ,coords[i+1]);
      }
      out.push({kind:item[0],coords,minX,minZ,maxX,maxZ});
    }
    return {features:out};
  }
  function create(pack,cell=CELL){
    const {features}=normalize(pack),buckets=new Map(),overflow=[];
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
      // Underlying service yards and intersection polygons.
      for(const kind of [2,1]){
        ctx.beginPath();
        for(const f of list){
          if(f.kind!==kind)continue;
          trace(f);ctx.closePath();
        }
        ctx.fillStyle=kind===1?'#3f5263':'#2a3f50';
        ctx.fill();
      }
      // Curved road geometry generated from actual ETS2 road definitions.
      ctx.strokeStyle='#758d9e';
      ctx.lineWidth=3.5;
      ctx.lineCap='round';ctx.lineJoin='round';
      ctx.beginPath();
      for(const f of list)if(f.kind===0)trace(f);
      ctx.stroke();
      ctx.restore();
      return list.length;
    }
    return {draw,query,count:features.length};
  }
  return {FORMAT,normalize,create};
});

/* High-zoom vector road renderer.
 * The overview uses the raster cache. Here we visit ONLY viewport segments,
 * so city-scale roads stay crisp instead of magnifying a 3072px image.
 */
(function(root,factory){
  const api=factory();
  root.ETS2VectorRoads=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const CELL=5000;
  function indexSegments(points,edges,cell=CELL){
    const buckets=new Map(),long=[];
    edges.forEach(([a,b],i)=>{
      const p=points[a],q=points[b];
      if(!p||!q)return;
      const x0=Math.floor(Math.min(p[0],q[0])/cell),x1=Math.floor(Math.max(p[0],q[0])/cell);
      const y0=Math.floor(Math.min(p[1],q[1])/cell),y1=Math.floor(Math.max(p[1],q[1])/cell);
      if((x1-x0+1)*(y1-y0+1)>72){long.push(i);return;}
      for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
        const key=x+':'+y;
        if(!buckets.has(key))buckets.set(key,[]);
        buckets.get(key).push(i);
      }
    });
    const marked=new Uint32Array(edges.length),counter={value:0};
    function query(x0,y0,x1,y1,limit=18000){
      const result=[],stamp=++counter.value;
      if(counter.value===4294967295){marked.fill(0);counter.value=1;}
      const minX=Math.floor(x0/cell),maxX=Math.floor(x1/cell),
        minY=Math.floor(y0/cell),maxY=Math.floor(y1/cell);
      for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){
        const bucket=buckets.get(x+':'+y);
        if(!bucket)continue;
        for(const i of bucket){
          if(marked[i]===stamp)continue;
          marked[i]=stamp;result.push(i);
          if(result.length>=limit)return result;
        }
      }
      for(const i of long)if(marked[i]!==stamp)result.push(i);
      return result;
    }
    function draw(ctx,view,stroke='#496779',width=2.8){
      const {minX,minZ,maxX,maxZ,left,top,cx,cz,scale}=view;
      const visible=query(minX,minZ,maxX,maxZ,26000);
      ctx.save();ctx.beginPath();
      ctx.strokeStyle=stroke;ctx.lineWidth=width;
      ctx.lineCap='round';ctx.lineJoin='round';
      for(const i of visible){
        const [a,b]=edges[i],p=points[a],q=points[b];
        if(Math.max(p[0],q[0])<minX||Math.min(p[0],q[0])>maxX||
          Math.max(p[1],q[1])<minZ||Math.min(p[1],q[1])>maxZ)continue;
        ctx.moveTo(left+(p[0]-cx)*scale,top+(p[1]-cz)*scale);
        ctx.lineTo(left+(q[0]-cx)*scale,top+(q[1]-cz)*scale);
      }
      ctx.stroke();ctx.restore();
      return visible.length;
    }
    return {query,draw};
  }
  return {indexSegments};
});

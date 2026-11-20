/* Original lightweight canvas pictograms. No icon font, image downloads or API. */
(function(root,factory){
  const api=factory();
  root.ETS2POISymbols=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function draw(ctx,x,y,category,{selected=false,size=26}={}){
  const metadata=(typeof globalThis!=='undefined'&&globalThis.ETS2POI?.categories?.[category])||null;
  const colors={fuel:'#199d63',service:'#3482db',parking:'#367acb',
    weigh:'#8c69cc',dealer:'#4e91ad',garage:'#439a6d',recruitment:'#648bca',
    company:'#d98a36',ferry:'#3589be',train:'#7c75c5',viewpoint:'#759852',
    landmark:'#b58a47'};
  const color=metadata?.color||colors[category]||'#788fa5';
  ctx.save();ctx.translate(x,y);ctx.scale(size/26,size/26);
  ctx.beginPath();
  if(typeof ctx.roundRect==='function')ctx.roundRect(-12,-12,24,24,5);
  else ctx.rect(-12,-12,24,24);
  ctx.fillStyle=color;ctx.fill();
  ctx.strokeStyle=selected?'#fff8aa':'#101e2b';ctx.lineWidth=selected?2.8:2;ctx.stroke();
  ctx.strokeStyle='#ffffff';ctx.fillStyle='#ffffff';ctx.lineWidth=1.8;
  ctx.lineCap='round';ctx.lineJoin='round';
  function path(points,closed=false){
    ctx.beginPath();points.forEach(([a,b],i)=>i?ctx.lineTo(a,b):ctx.moveTo(a,b));
    if(closed)ctx.closePath();ctx.stroke();
  }
  function rect(a,b,w,h,fill=false){
    if(fill)ctx.fillRect(a,b,w,h);else ctx.strokeRect(a,b,w,h);
  }
  switch(category){
    case 'fuel':
      rect(-7,-7,8,15);rect(-5,-5,4,4,true);
      path([[1,-4],[5,-2],[7,1],[7,6],[5,7],[4,5]]);
      break;
    case 'service':
      path([[-6,7],[3,-2]],false);
      ctx.beginPath();ctx.arc(-7,8,1.6,0,2*Math.PI);ctx.stroke();
      path([[3,-2],[2,-6],[5,-9],[8,-7],[6,-4],[3,-2]]);
      break;
    case 'parking':
      ctx.font='900 17px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('P',0,1);break;
    case 'dealer':
      rect(-9,-2,11,7);path([[2,-1],[6,-1],[9,2],[9,5],[2,5]]);
      for(const a of [-5,6]){ctx.beginPath();ctx.arc(a,6,2,0,Math.PI*2);ctx.fill();}
      break;
    case 'company':
      rect(-8,-8,16,16);for(const px of [-5,1])for(const py of [-5,0])rect(px,py,3,3,true);
      rect(-2,5,4,3,true);break;
    case 'garage':
      path([[-9,-1],[0,-9],[9,-1],[9,9],[-9,9],[-9,-1]]);
      rect(-5,0,10,9);path([[-5,4],[5,4]]);break;
    case 'weigh':
      path([[-7,7],[7,7],[5,3],[-5,3],[-7,7]]);
      path([[0,3],[0,-7],[-5,-7],[5,-7]]);
      path([[-7,-3],[-4,1],[-1,-3]]);path([[1,-3],[4,1],[7,-3]]);
      break;
    case 'recruitment':
      ctx.beginPath();ctx.arc(0,-5,3,0,2*Math.PI);ctx.stroke();
      path([[-7,8],[-7,4],[-4,1],[4,1],[7,4],[7,8]]);break;
    case 'ferry':
      path([[-8,3],[8,3],[5,8],[-5,8],[-8,3]]);
      rect(-5,-4,10,7);path([[-8,10],[-4,9],[0,10],[4,9],[8,10]]);break;
    case 'train':
      rect(-6,-8,12,13);rect(-3,-5,6,4);rect(-3,3,2,2,true);rect(2,3,2,2,true);
      path([[-5,5],[-8,9],[8,9],[5,5]]);break;
    case 'viewpoint':
      ctx.beginPath();ctx.ellipse(0,0,9,5,0,0,2*Math.PI);ctx.stroke();
      ctx.beginPath();ctx.arc(0,0,2.5,0,2*Math.PI);ctx.fill();break;
    case 'landmark':
      path([[0,-9],[3,-3],[9,-2],[4,3],[5,9],[0,6],[-5,9],[-4,3],[-9,-2],[-3,-3],[0,-9]],true);
      break;
    default:
      ctx.beginPath();ctx.arc(0,0,4,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}
return {draw};
});

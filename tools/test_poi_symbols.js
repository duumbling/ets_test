'use strict';
const assert=require('node:assert/strict');
const {draw}=require('../site/poi-symbols.js');
function mock(){
  const calls=[];
  const ctx={save(){calls.push('save');},restore(){calls.push('restore');},
    translate(){},scale(){},beginPath(){},roundRect(){},rect(){},
    arc(){},ellipse(){},moveTo(){},lineTo(){},closePath(){},
    stroke(){calls.push('stroke');},fill(){calls.push('fill');},
    strokeRect(){calls.push('rect');},fillRect(){calls.push('filled-rect');},
    fillText(){calls.push('text');},strokeText(){}};
  return {ctx,calls};
}
const cats=['fuel','service','parking','dealer','company','garage','weigh',
  'recruitment','ferry','train','viewpoint','landmark'];
for(const category of cats){
  const {ctx,calls}=mock();
  draw(ctx,80,40,category,{selected:true,size:30});
  assert.equal(calls[0],'save',category);
  assert.equal(calls.at(-1),'restore',category);
  assert.ok(calls.includes('fill'),category+' should render a background');
  assert.ok(calls.includes('stroke'),category+' should render outlines');
}
{
  const {ctx,calls}=mock();
  draw(ctx,10,10,'missing-category');
  assert.equal(calls.at(-1),'restore');
}
console.log('POI icon regression: 12 canvas pictograms rendered without image dependencies');

'use strict';
const assert=require('node:assert/strict');
const {FORMAT,normalize,create}=require('../site/city-detail.js');
const test={format:FORMAT,coordinateSystem:'ets2',geometry:[
  [0,[0,0,10,0,15,15]],
  [1,[0,0,10,0,10,10,0,10,0,0]],
  [2,[500,500,550,500,550,550,500,550]],
  [0,[1500,1500,1800,1700]]
]};
assert.equal(normalize(test).features.length,4);
assert.throws(()=>normalize({...test,geometry:[[0,[1,NaN,2,3]]]}),/геометрия/);
assert.throws(()=>normalize({...test,format:'bad'}),/формат/);
const layer=create(test,200);
assert.equal(layer.count,4);
assert.deepEqual(layer.query(-20,-20,30,30).map(f=>f.kind),[0,1]);
assert.equal(layer.query(1200,1200,2000,2000).length,1);
assert.equal(layer.query(1200,1200,1300,1300).length,0);
let paths=0,strokes=0,fills=0;
const ctx={save(){},restore(){},beginPath(){},moveTo(){paths++;},lineTo(){},closePath(){},stroke(){strokes++;},fill(){fills++;}};
assert.equal(layer.draw(ctx,{minX:-20,minZ:-20,maxX:30,maxZ:30,left:50,top:50,cx:0,cz:0,scale:2}),2);
assert.equal(strokes,1);assert.equal(fills,2);assert.ok(paths>=2);
console.log('Detailed city geometry tests passed');

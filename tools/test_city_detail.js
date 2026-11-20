'use strict';
const assert=require('node:assert/strict');
const {FORMAT,LEGACY_FORMAT,normalize,create}=require('../site/city-detail.js');
const test={format:FORMAT,coordinateSystem:'ets2',geometry:[
  [0,[0,0,10,0,15,15],12],                // ordinary road
  [1,[0,0,10,0,10,10,0,10,0,0]],       // intersection polygon
  [2,[500,500,550,500,550,550,500,550]],
  [0,[1500,1500,1800,1700],8],
  [3,[0,0,10,10,10,0,0,10],9],          // real prefab connector roads
]};
assert.equal(normalize(test).features.length,5);
assert.equal(normalize(test).counters.prefabLines,1);
assert.throws(()=>normalize({...test,geometry:[[0,[1,NaN,2,3]]]}),/геометрия/);
assert.throws(()=>normalize({...test,format:'bad'}),/формат/);
const layer=create(test,200);
assert.equal(layer.count,5);
assert.equal(layer.isLegacy,false);
assert.deepEqual(layer.query(-20,-20,30,30).map(f=>f.kind),[0,1,3]);
assert.equal(layer.query(1200,1200,2000,2000).length,1);
assert.equal(layer.query(1200,1200,1300,1300).length,0);
let paths=0,strokes=0,fills=0;
const order=[];
const ctx={save(){},restore(){},beginPath(){},moveTo(){paths++;},lineTo(){},closePath(){},
  stroke(){strokes++;order.push('stroke');},fill(){fills++;order.push('fill');}};
assert.equal(layer.draw(ctx,{minX:-20,minZ:-20,maxX:30,maxZ:30,left:50,top:50,cx:0,cz:0,scale:2}),3);
assert.equal(strokes,4,'ordinary roads and prefab connectors both receive casing and surface');
assert.equal(fills,2,'map area and prefab road surface are filled first');
assert.equal(paths,3,'ordinary road, prefab polygon and prefab connector are all traced');
assert.ok(order.indexOf('fill')<order.indexOf('stroke'),'junction surface must be painted below connecting roads');
const legacy=create({...test,format:LEGACY_FORMAT,geometry:test.geometry.slice(0,4).map(v=>v.slice(0,2))},200);
assert.equal(legacy.isLegacy,true);
assert.equal(legacy.counters.prefabLines,0);
console.log('Detailed city v2 geometry: ordinary roads + prefab connectors visible above surfaces; v1 compatibility');

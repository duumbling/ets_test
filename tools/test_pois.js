const assert=require('node:assert/strict');
const {categories,createIndex}=require('../site/pois.js');
assert.equal(categories.fuel.label,'Заправки');
const list=[
  {id:'gas',category:'fuel',x:10,z:10},
  {id:'repair',category:'service',x:14,z:12},
  {id:'highway',category:'fuel',x:155,z:155},
  {id:'parking',category:'parking',x:-10,z:-10},
];
const index=createIndex(list,40);
assert.deepEqual(index.within(0,0,20,20,'fuel').map(x=>x.id),['gas']);
assert.deepEqual(index.within(0,0,20,20,'all').map(x=>x.id),['gas','repair']);
assert.deepEqual(index.within(120,120,200,200,'all').map(x=>x.id),['highway']);
assert.deepEqual(index.within(-20,-20,0,0,'parking').map(x=>x.id),['parking']);
assert.equal(index.within(0,0,200,200,'all',1).length,1);
console.log('ETS2 POI spatial indexing tests passed');

const assert = require('node:assert/strict');
const {normalize,shortest} = require('../site/routepack.js');
const p = normalize({format:'ets2-routepack-v1',coordinateSystem:'ets2',title:'Test',
  points:[[0,0],[10,0],[10,10],[25,10]],
  links:[[0,1,11],[1,2,12],[2,3,18],[0,3,70]],
  cities:[['a','А',0,0,0],['b','Б',25,10,3]]});
assert.equal(p.nodes[0].roadNode,0);
assert.equal(p.roads.length,4);
assert.deepEqual(shortest(p.adj,0,3),{path:[0,1,2,3],meters:41});
assert.equal(shortest(p.adj,3,0),null,'the links must remain one-way');
assert.deepEqual(shortest(p.adj,1,1),{path:[1],meters:0});
assert.throws(()=>normalize({format:'ets2-routepack-v1',coordinateSystem:'ets2',points:[[0,0],[1,0]],links:[[0,8,1]],cities:[['a','A',0,0,0],['b','B',1,0,1]]}),/Некорректная связь/);
assert.throws(()=>normalize({coordinateSystem:'demo'}),/ets2-routepack-v1/);
console.log('ETS2 routepack tests: OK');

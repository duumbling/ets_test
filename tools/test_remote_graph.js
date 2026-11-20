'use strict';
const assert=require('node:assert/strict');
const {parse}=require('../site/remote-graph.js');

function build(){
  const N=3,M=2,U=1,C=1;
  let chunks=[];
  function emit(bytes){chunks.push(bytes);}
  function header(){
    const b=new ArrayBuffer(24),v=new DataView(b);
    v.setUint32(0,0x47524454,true);v.setUint32(4,3,true);
    v.setUint32(8,N,true);v.setUint32(12,M,true);
    v.setUint32(16,U,true);v.setUint32(20,C,true);
    emit(new Uint8Array(b));
  }
  function arr(Type,values){
    const t=new Type(values),p=new Uint8Array((t.byteLength+3)&~3);
    p.set(new Uint8Array(t.buffer));emit(p);
  }
  header();
  arr(Int32Array,[0,0,10000,0,20000,0]);
  arr(Uint32Array,[0,1]); // edge a
  arr(Uint32Array,[1,2]); // edge b
  arr(Uint32Array,[1000,1000]); // road distance
  arr(Uint16Array,[30,40]); // seconds
  arr(Uint8Array,[0,2]); // 1->2 only on second edge
  arr(Uint32Array,[0,1,1]); // midpoint offsets
  arr(Int32Array,[5000,2000]); // first midpoint
  arr(Uint8Array,[1,2,1]); // degrees
  arr(Int32Array,[0,0,0]); // component id
  arr(Uint32Array,[3]); // component size
  arr(Int8Array,[0,0]); // shift A
  arr(Int8Array,[0,0]); // shift B
  arr(Uint8Array,[0,0]); // DLC guard
  const length=chunks.reduce((s,c)=>s+c.length,0);
  const bytes=new Uint8Array(length);let at=0;
  for(const b of chunks){bytes.set(b,at);at+=b.length;}
  return bytes.buffer;
}
const graph=parse(build());
assert.equal(graph.version,3);assert.equal(graph.nodes,3);
assert.equal(graph.edges,2);assert.equal(graph.arcs,3);
assert.equal(graph.nearest(1001,1),1);
const forward=graph.shortest(0,2);
assert.deepEqual(forward.nodes,[0,1,2]);
assert.deepEqual(forward.edges,[0,1]);
assert.equal(forward.meters,200);
assert.deepEqual(graph.routeGeometry(forward),[[0,0],[500,200],[1000,0],[2000,0]]);
assert.equal(graph.shortest(2,0),null,'One-way edge cannot be reversed');
assert.deepEqual(graph.shortest(1,0).nodes,[1,0]);
assert.deepEqual(graph.routeGeometry(graph.shortest(1,0)),[[1000,0],[500,200],[0,0]]);
assert.throws(()=>parse(new ArrayBuffer(4)),/Граф/);
const corrupted=build();new DataView(corrupted).setUint32(4,100,true);
assert.throws(()=>parse(corrupted),/Неподдерживаемая/);
console.log('TDRG v3 binary adapter tests passed: directed routes and road bends');

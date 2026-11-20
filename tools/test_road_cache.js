'use strict';
const assert = require('node:assert/strict');
const { create } = (() => {
  const oldDocument = global.document;
  let drawnEdges = 0;
  let rasterStrokes = 0;
  let blits = 0;
  const context = {
    beginPath() {}, moveTo() { drawnEdges++; }, lineTo() {},
    stroke() { rasterStrokes++; },
  };
  global.document = {
    createElement(name) {
      assert.equal(name, 'canvas');
      return { width: 0, height: 0, getContext: () => context };
    },
  };
  const lib = require('../site/road-cache.js');
  global.document = oldDocument;
  return { ...lib, stats: () => ({ drawnEdges, rasterStrokes }) };
})();
const points = [[0,0], [10,0], [10,10], [0,10]];
const roads = [[0,1],[1,2],[2,3],[3,0]];
const bounds = {cx:5,cz:5,dx:10,dz:10};
const oldDocument = global.document;
let edgeCount = 0, strokes = 0, draws = 0, lastDraw = null;
global.document = {
  createElement() {
    return { width:0, height:0, getContext() {
      return { beginPath(){}, moveTo(){edgeCount++;}, lineTo(){}, stroke(){strokes++;} };
    }};
  },
};
const cache = create(points, roads, bounds, 1024);
global.document = oldDocument;
assert.equal(edgeCount, 4);
assert.equal(strokes, 1);
assert.ok(cache.width > 0 && cache.height > 0);
const target = {
  drawImage(...args) { draws++; lastDraw = args; },
};
for(let i=0; i<100; i++) {
  cache.draw(target, 50, 450+i, 350, 5, 5, 900, 700);
}
assert.equal(edgeCount, 4, 'panning must not traverse or rasterize road edges again');
assert.equal(strokes, 1, 'the road layer should be drawn once per map import');
assert.equal(draws, 100);
assert.equal(lastDraw.length, 9, 'viewport cropping should use drawImage source clipping');
const before=draws;
cache.draw(target, 1, -10000, -10000, 5, 5, 900, 700);
assert.equal(draws, before, 'off-screen road image must not trigger drawImage');
console.log('Road cache tests passed: one rasterization, single clipped image per pan frame');

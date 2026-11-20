import fs from 'node:fs';
import { fromEts2CoordsToWgs84 } from './packages/libs/map/projections';
const p=(x:number,z:number)=>fromEts2CoordsToWgs84([x,z]);
const features=[
  {type:'Feature',properties:{type:'road',leftLanes:1,rightLanes:1},
   geometry:{type:'LineString',coordinates:[p(0,0),p(100,0),p(120,30)]}},
  {type:'Feature',properties:{type:'road',prefab:'crossing',leftLanes:1,rightLanes:1},
   geometry:{type:'LineString',coordinates:[p(10,0),p(20,10),p(30,0)]}},
  {type:'Feature',properties:{type:'prefab'},
   geometry:{type:'Polygon',coordinates:[[p(0,0),p(100,0),p(100,100),p(0,100),p(0,0)]]}},
  {type:'Feature',properties:{type:'poi'},
   geometry:{type:'Point',coordinates:p(50,50)}},
];
fs.writeFileSync('city-smoke.geojson',JSON.stringify({type:'FeatureCollection',features}));
console.log('Created city-smoke.geojson with real ETS2 projection');

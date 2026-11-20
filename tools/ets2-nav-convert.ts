/* Convert truckermudgeon map GeoJSON to compact game-coordinate geometry.
 * Run inside the cloned truckermudgeon/maps directory using npx tsx.
 * Original projection is reused from the local map toolchain (no guessing).
 * The result is for local/browser-only use, not public redistribution.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fromWgs84ToEts2Coords } from './packages/libs/map/projections';

type Vec = number[];
type Feature = {
  geometry?: {type:string;coordinates:any};
  properties?: {type?:string};
};
const source=process.argv[2],destination=process.argv[3];
if(!source||!destination)throw Error('Usage: tsx ets2-nav-convert.ts ets2.geojson ets2-detail.json.gz');
const obj=JSON.parse(fs.readFileSync(source,'utf8'));
if(!Array.isArray(obj.features))throw Error('Expected GeoJSON FeatureCollection');
const geometry: [number,Vec][]=[];
let bounds=[Infinity,Infinity,-Infinity,-Infinity];
const MAX=1_200_000;
function convertPoint(point:unknown):[number,number]{
  if(!Array.isArray(point)||point.length<2||
      typeof point[0]!=='number'||typeof point[1]!=='number')
    throw Error('Invalid GeoJSON point');
  const [x,z]=fromWgs84ToEts2Coords([point[0],point[1]]);
  return [Math.round(x*10)/10, Math.round(z*10)/10];
}
function append(kind:number,sourceCoords:unknown){
  if(!Array.isArray(sourceCoords)||sourceCoords.length<2)return;
  const line:number[]=[];
  let lastX=Infinity,lastZ=Infinity;
  for(const point of sourceCoords){
    const [x,z]=convertPoint(point);
    if(!Number.isFinite(x)||!Number.isFinite(z))continue;
    if(x===lastX&&z===lastZ)continue;
    line.push(x,z);lastX=x;lastZ=z;
    bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],z);
    bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],z);
  }
  if(line.length < (kind===0?4:6))return;
  geometry.push([kind,line]);
  if(geometry.length>MAX)throw Error('Too many detail features');
}
let roads=0,prefabs=0,areas=0;
for(const f of obj.features as Feature[]){
  const kind = f.properties?.type==='road'?0:
    f.properties?.type==='prefab'?1:
    f.properties?.type==='mapArea'?2:-1;
  if(kind<0||!f.geometry)continue;
  const type=f.geometry.type,coords=f.geometry.coordinates;
  let before=geometry.length;
  if(type==='LineString'&&kind===0)append(kind,coords);
  else if(type==='MultiLineString'&&kind===0&&Array.isArray(coords))
    for(const line of coords)append(kind,line);
  else if(type==='Polygon'&&kind!==0&&Array.isArray(coords)){
    for(const ring of coords)append(kind,ring);
  }else if(type==='MultiPolygon'&&kind!==0&&Array.isArray(coords)){
    for(const polygon of coords)for(const ring of polygon)append(kind,ring);
  }
  const count=geometry.length-before;
  if(kind===0)roads+=count;else if(kind===1)prefabs+=count;else areas+=count;
}
if(roads<1||!geometry.length)throw Error('No road line geometry found in GeoJSON');
const output={format:'ets2-city-detail-v1',coordinateSystem:'ets2',
  geometry,bounds,source:'Generated locally from ETS2 GeoJSON'};
const gzip=zlib.gzipSync(Buffer.from(JSON.stringify(output)),{level:7});
fs.writeFileSync(destination,gzip);
console.log(JSON.stringify({roads,prefabs,areas,bounds,bytes:gzip.length,output:destination}));

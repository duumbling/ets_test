/* ETS2 Navigator: read a user-selected, released PMTiles map without
 * relying on third-party locked hosting or scanning SCS game archives.
 * Optional import of an existing routepack enables approximate directions.
 * The imported PMTiles never leaves the browser.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let map=null,protocol=null,pack=null,ready=false,cities=[],archive=null;
const EARTH=6370997,DEGREE=EARTH*Math.PI/180;
const LL=proj4('+proj=lcc +R='+EARTH+' +lat_1=37 +lat_2=65 +lat_0=50 +lon_0=15');
function gameToGeo(x,z){
  const sx=Math.floor(x/4000),sz=Math.floor(z/4000);
  x-=16660;z-=4150;
  if(sx<=-8&&sz<=-2&&!(sx===-8&&sz===-2)){
    x=(x-31100/2)*.75;z=(z-5500/2)*.75;
  }
  return LL.inverse([x*.0001729241463*DEGREE,z*(-.000171570875)*DEGREE]);
}
function message(id,content,error=false){
  const e=$(id);e.textContent=content;e.classList.toggle('error',error);
}
function featureCollection(features=[]){return{type:'FeatureCollection',features};}
function style(sourceLayer,fileUrl){
  const vector={type:'vector',url:fileUrl};
  const paintRoad={ 'line-color':'#98b0bc','line-width':['interpolate',['linear'],['zoom'],4,.6,9,2.1,13,5,16,11] };
  return {version:8,
    glyphs:'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources:{game:vector,route:{type:'geojson',data:featureCollection()},
      markers:{type:'geojson',data:featureCollection()}},
    layers:[
      {id:'background',type:'background',paint:{'background-color':'#10212e'}},
      {id:'land',type:'fill',source:'game','source-layer':sourceLayer,
       filter:['==',['get','type'],'mapArea'],
       paint:{'fill-color':['match',['get','color'],0,'#314457',1,'#536470',2,'#1b2b38',3,'#2b493d','#30485a'],'fill-opacity':.8}},
      {id:'junctions',type:'fill',source:'game','source-layer':sourceLayer,
       filter:['==',['get','type'],'prefab'],paint:{'fill-color':'#7a8c96'}},
      {id:'roads',type:'line',source:'game','source-layer':sourceLayer,
       filter:['==',['get','type'],'road'],layout:{'line-cap':'round','line-join':'round'},
       paint:paintRoad},
      {id:'route-casing',type:'line',source:'route',paint:{'line-color':'#092b2c','line-width':9},
       layout:{'line-cap':'round','line-join':'round'}},
      {id:'route-line',type:'line',source:'route',paint:{'line-color':'#5aefb7','line-width':5},
       layout:{'line-cap':'round','line-join':'round'}},
      {id:'city-names',type:'symbol',source:'game','source-layer':sourceLayer,
       filter:['==',['get','type'],'city'],layout:{'text-field':['get','name'],
         'text-font':['Open Sans Regular'],'text-size':['interpolate',['linear'],['zoom'],5,10,11,14]},
       paint:{'text-color':'#ecf6fc','text-halo-color':'#10212e','text-halo-width':2}},
      {id:'poi',type:'symbol',source:'game','source-layer':sourceLayer,minzoom:7,
       filter:['==',['get','type'],'poi'],
       layout:{'icon-image':['match',['get','sprite'],
         'gas_ico','gas_ico','service_ico','service_ico',
         'parking_ico','parking_ico','dealer_ico','dealer_ico',
         'garage_large_ico','garage_large_ico','recruitment_ico','recruitment_ico',
         'weigh_station_ico','weigh_station_ico','train_ico','train_ico','unknown'],
         'icon-size':.9,'icon-allow-overlap':false}},
      {id:'route-points',type:'circle',source:'markers',
       paint:{'circle-radius':7,'circle-color':['match',['get','which'],'start','#68e3b1','end','#ffad80','#f4ca8c'],
         'circle-stroke-width':2,'circle-stroke-color':'#f8f8ff'}},
    ]
  };
}
function addIcons(){
  for(const [key,kind] of Object.entries({
    gas_ico:'fuel',service_ico:'service',parking_ico:'parking',
    dealer_ico:'dealer',garage_large_ico:'garage',
    recruitment_ico:'recruitment',weigh_station_ico:'weigh',
    train_ico:'train',unknown:'company',
  })){
    if(map.hasImage(key))continue;
    const cv=document.createElement('canvas');cv.width=40;cv.height=40;
    window.ETS2POISymbols.draw(cv.getContext('2d'),20,20,kind,{size:33});
    map.addImage(key,cv.getContext('2d').getImageData(0,0,40,40),{pixelRatio:2});
  }
}
async function loadTiles(file){
  if(!file)return;
  message('mapStatus','Читаю заголовок и слои карты…');
  try{
    if(typeof pmtiles==='undefined'||typeof maplibregl==='undefined')throw Error('Не загрузились библиотеки карты');
    const src=new pmtiles.FileSource(file);
    const pm=new pmtiles.PMTiles(src);
    const [meta,head]=await Promise.all([pm.getMetadata(),pm.getHeader()]);
    if(head.tileType!==1)throw Error('Это не векторная PMTiles-карта');
    const found=(meta.vector_layers||[]).map(l=>String(l.id||'')).filter(Boolean);
    const layer=['ets2','europe'].find(x=>found.includes(x))||found[0];
    if(!layer)throw Error('Не удалось определить слой ETS2 в файле');
    if(!protocol){protocol=new pmtiles.Protocol();maplibregl.addProtocol('pmtiles',protocol.tile);}
    protocol.add(pm);archive=pm;
    if(map){map.remove();map=null;}
    ready=false;
    const fileURL='pmtiles://'+src.getKey();
    map=new maplibregl.Map({
      container:'map',style:style(layer,fileURL),center:[15,50],zoom:5,
      minZoom:2,maxZoom:17,attributionControl:false,fadeDuration:0,
    });
    map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
    map.on('load',()=>{
      ready=true;addIcons();
      message('mapStatus','Готово: '+file.name+' · слой '+layer+' · '+(file.size/1048576).toFixed(1)+' МБ. Карта читается локально.');
      $('mapHint').textContent='Приближай города колёсиком мыши. Маршруты доступны после импорта отдельного графа.';
      if(pack)drawRoute();
    });
    map.on('error',evt=>{
      const reason=evt.error?.message||String(evt.error||'');
      console.error('MapLibre map error',reason);
      if(!ready)message('mapStatus','Ошибка отображения карты: '+reason.slice(0,170),true);
    });
    map.on('click','poi',evt=>{
      const p=evt.features?.[0]?.properties;
      const coords=evt.features?.[0]?.geometry?.coordinates;
      const name=p?.name||p?.sprite||'Объект ETS2';
      if(coords?.length===2){
        new maplibregl.Popup().setLngLat(coords).setText(name).addTo(map);
        message('routeStatus','Выбран объект: '+name+'. Для маршрута к конкретному въезду потребуется точная привязка POI к графу.');
      }
    });
  }catch(error){
    message('mapStatus','Не удалось прочитать готовую карту: '+error.message,true);
    console.error(error);
  }
}
async function loadRoutepack(file){
  if(!file)return;
  try{
    if(file.size>70*1048576)throw Error('Слишком большой JSON');
    pack=window.ETS2RoutePack.normalize(JSON.parse(await file.text()));
    cities=pack.nodes.slice().sort((a,b)=>a.name.localeCompare(b.name,'ru'));
    for(const id of ['fromCity','toCity']){
      const select=$(id);select.replaceChildren(...cities.map((c,i)=>new Option(c.name,String(i))));select.disabled=false;
    }
    $('fromCity').value=String(Math.max(0,cities.findIndex(c=>/glasgow/i.test(c.name))));
    $('toCity').value=String(Math.max(0,cities.findIndex(c=>/edinburgh/i.test(c.name))));
    $('routeBtn').disabled=false;
    message('routeStatus','Маршрутный граф '+cities.length+' городов и '+pack.points.length+' узлов загружен. Он остаётся приблизительным.');
  }catch(err){message('routeStatus','Ошибка маршрута: '+err.message,true);}
}
function drawRoute(){
  if(!ready||!map||!pack){message('routeStatus','Загрузи и карту PMTiles, и JSON дорожного графа.');return;}
  const from=cities[Number($('fromCity').value)],to=cities[Number($('toCity').value)];
  if(!from||!to)return;
  message('routeStatus','Строю маршрут…');
  setTimeout(()=>{
    try{
      const result=window.ETS2RoutePack.shortest(pack.adj,from.roadNode,to.roadNode);
      if(!result)throw Error('Нет пути по направленному графу');
      const coords=result.path.map(i=>gameToGeo(...pack.points[i]));
      map.getSource('route').setData(featureCollection([{
        type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}
      }]));
      map.getSource('markers').setData(featureCollection([
        {type:'Feature',properties:{which:'start'},geometry:{type:'Point',coordinates:gameToGeo(from.x,from.z)}},
        {type:'Feature',properties:{which:'end'},geometry:{type:'Point',coordinates:gameToGeo(to.x,to.z)}},
      ]));
      const bounds=coords.reduce((a,c)=>a.extend(c),new maplibregl.LngLatBounds(coords[0],coords[0]));
      map.fitBounds(bounds,{padding:65,maxZoom:11,duration:500});
      message('routeStatus',from.name+' → '+to.name+' · '+(result.meters/1000).toFixed(1)+
        ' км по приблизительному графу · '+result.path.length+' узлов.');
    }catch(err){message('routeStatus',err.message,true);}
  },20);
}
$('tileFile').addEventListener('change',e=>{loadTiles(e.target.files?.[0]);});
$('routepackFile').addEventListener('change',e=>{loadRoutepack(e.target.files?.[0]);});
$('routeBtn').addEventListener('click',drawRoute);
})();

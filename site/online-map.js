/* ETS2 Navigator online-map preview: read prebuilt ETS2 vector tiles + TDRG
 * graph from a third-party public source. No game extraction, no rehosting.
 * Map sources and versions: github.com/Nethercap/truck-companion.
 * The data is not licensed by this file; follow source and SCS terms.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const BASE='https://maps.trucksim-dash.com';
const MAPS={
  ets2:{version:'1.62.2.1',built:'10.11.2026',stamp:'20261110',center:[15,50]},
  ets2_tmp:{version:'1.62.3.2',built:'16.11.2026',stamp:'20261116',center:[15,50]},
  ets2_promods:{version:'1.61.1',built:'29.09.2026',stamp:'20261022',center:[15,50]},
  ets2_promods_rusmap:{version:'1.61.1',built:'29.09.2026',stamp:'20261022',center:[15,50]},
};
let map=null,graph=null,cities=[],poiTarget=null,requestId=0,abort=null;
const EARTH=6370997,DEGREE=EARTH*Math.PI/180;
let projection=null;
function ensureProjection(){
  if(!projection){
    if(typeof proj4!=='function')throw Error('Не загрузился модуль координат (proj4).');
    projection=proj4('+proj=lcc +R='+EARTH+' +lat_1=37 +lat_2=65 +lat_0=50 +lon_0=15');
  }
  return projection;
}
function gameToGeo(x,z){
  ensureProjection();
  const sx=Math.floor(x/4000),sz=Math.floor(z/4000);
  x-=16660;z-=4150;
  if(sx<=-8&&sz<=-2&&!(sx===-8&&sz===-2)){
    x=(x-31100/2)*.75;z=(z-5500/2)*.75;
  }
  return projection.inverse([x*.0001729241463*DEGREE,z*(-.000171570875)*DEGREE]);
}
function geoToGame(lng,lat){
  ensureProjection();
  const p=projection.forward([lng,lat]);
  const x=p[0]/(.0001729241463*DEGREE),z=p[1]/(-.000171570875*DEGREE);
  const normal=[x+16660,z+4150],sx=Math.floor(normal[0]/4000),sz=Math.floor(normal[1]/4000);
  if(sx<=-8&&sz<=-2&&!(sx===-8&&sz===-2))
    return [x/.75+31100/2+16660,z/.75+5500/2+4150];
  return normal;
}
function status(id,message,error=false){
  const el=$(id);el.textContent=message;el.classList.toggle('error',error);
}
function toFeatureCollection(features=[]){return {type:'FeatureCollection',features};}
function coordinatesForCity(city){return gameToGeo(city.X,city.Y);}
function style(url){
  const source='ets2';
  const textStyle={type:'symbol',source:'ets2','source-layer':source,
    layout:{'text-field':['get','name'],'text-font':['Open Sans Regular'],'text-size':['interpolate',['linear'],['zoom'],5,10,12,15]},
    paint:{'text-color':'#e6f4ff','text-halo-color':'#0c1a25','text-halo-width':2}};
  return {version:8,glyphs:'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources:{ets2:{type:'vector',url:'pmtiles://'+url},
      route:{type:'geojson',data:toFeatureCollection()},
      points:{type:'geojson',data:toFeatureCollection()}},
    layers:[
      {id:'background',type:'background',paint:{'background-color':'#10212e'}},
      {id:'areas',type:'fill',source:'ets2','source-layer':source,
       filter:['==',['get','type'],'mapArea'],paint:{'fill-color':['match',['get','color'],0,'#324354',1,'#506277',2,'#1a2834',3,'#273f36','#34495a'],'fill-opacity':.85}},
      {id:'junctions',type:'fill',source:'ets2','source-layer':source,
       filter:['==',['get','type'],'prefab'],paint:{'fill-color':'#667d8c','fill-opacity':.95}},
      {id:'ferries',type:'line',source:'ets2','source-layer':source,
       filter:['in',['get','type'],['literal',['ferry','train']]],
       paint:{'line-color':'#679ba9','line-opacity':.5,'line-width':1.5,'line-dasharray':[3,3]}},
      {id:'roads-local',type:'line',source:'ets2','source-layer':source,
       filter:['all',['==',['get','type'],'road'],['==',['get','roadType'],'local']],
       layout:{'line-cap':'round','line-join':'round'},
       paint:{'line-color':'#899da9','line-width':['interpolate',['linear'],['zoom'],4,.6,9,2,13,6,16,13]}},
      {id:'roads-divided',type:'line',source:'ets2','source-layer':source,
       filter:['all',['==',['get','type'],'road'],['==',['get','roadType'],'divided']],
       layout:{'line-cap':'round','line-join':'round'},
       paint:{'line-color':'#c2ced8','line-width':['interpolate',['linear'],['zoom'],4,.6,9,2.5,13,7,16,16]}},
      {id:'roads-freeway',type:'line',source:'ets2','source-layer':source,
       filter:['all',['==',['get','type'],'road'],['==',['get','roadType'],'freeway']],
       layout:{'line-cap':'round','line-join':'round'},
       paint:{'line-color':'#b4ccbc','line-width':['interpolate',['linear'],['zoom'],4,.8,9,3,13,9,16,19]}},
      {id:'roads-other',type:'line',source:'ets2','source-layer':source,
       filter:['all',['==',['get','type'],'road'],
        ['!', ['in',['get','roadType'],['literal',['local','divided','freeway']]]]],
       paint:{'line-color':'#9eb1ba','line-width':['interpolate',['linear'],['zoom'],4,.5,12,5]}},
      {id:'route-outline',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},
       paint:{'line-color':'#082727','line-width':9,'line-opacity':.95}},
      {id:'route-line',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},
       paint:{'line-color':'#59efae','line-width':5}},
      {id:'city-label',...textStyle,filter:['==',['get','type'],'city']},
      {id:'poi-icons',type:'symbol',source:'ets2','source-layer':source,minzoom:7,
       filter:['==',['get','type'],'poi'],
       layout:{'icon-image':['match',['get','sprite'],
         'gas_ico','gas_ico','service_ico','service_ico',
         'parking_ico','parking_ico','dealer_ico','dealer_ico',
         'garage_large_ico','garage_large_ico',
         'recruitment_ico','recruitment_ico',
         'weigh_station_ico','weigh_station_ico',
         'train_ico','train_ico',
         'generic'],'icon-size':.86,'icon-allow-overlap':false}},
      {id:'waypoints',type:'circle',source:'points',
       paint:{'circle-radius':8,'circle-color':['match',['get','role'],'start','#62e5ba','end','#ffae80','#f2cf96'],
         'circle-stroke-color':'#f9ffff','circle-stroke-width':2}}
    ]};
}
function addSymbols(){
  const sprites={
    gas_ico:'fuel',service_ico:'service',parking_ico:'parking',
    dealer_ico:'dealer',garage_large_ico:'garage',
    recruitment_ico:'recruitment',weigh_station_ico:'weigh',
    train_ico:'train',generic:'company'
  };
  for(const [id,category] of Object.entries(sprites)){
    if(map.hasImage(id))continue;
    const c=document.createElement('canvas');c.width=44;c.height=44;
    const ctx=c.getContext('2d');
    window.ETS2POISymbols.draw(ctx,22,22,category,{size:38});
    map.addImage(id,ctx.getImageData(0,0,44,44),{pixelRatio:2});
  }
}
function prepareCities(records){
  if(!Array.isArray(records))throw Error('Неподдерживаемый формат списка городов');
  const out=records.filter(c=>c&&Number.isFinite(c.X)&&Number.isFinite(c.Y)&&typeof c.Name==='string');
  if(out.length<2)throw Error('В опубликованном наборе слишком мало городов');
  out.sort((a,b)=>a.Name.localeCompare(b.Name,'ru'));
  for(const id of ['fromCity','toCity']){
    const sel=$(id);sel.replaceChildren(...out.map((c,i)=>new Option(c.Name,String(i))));
    sel.disabled=false;
  }
  $('fromCity').value=String(Math.max(0,out.findIndex(c=>/glasgow/i.test(c.Name))));
  $('toCity').value=String(Math.max(0,out.findIndex(c=>/edinburgh/i.test(c.Name))));
  return out;
}
function drawRoute(){
  if(!map||!graph||!cities.length)return;
  const first=cities[Number($('fromCity').value)];
  const last=poiTarget||cities[Number($('toCity').value)];
  if(!first||!last)return;
  status('routeStatus','Рассчитываю маршрут…');
  // Allow status to paint before CPU-intensive search.
  setTimeout(()=>{
    try{
      const start=graph.nearest(first.X,first.Y),
            finish=graph.nearest(last.X,last.Y);
      const result=graph.shortest(start,finish);
      if(!result)throw Error('Нет проезжего пути по направленному дорожному графу.');
      const gps=graph.routeGeometry(result).map(([x,z])=>gameToGeo(x,z));
      if(gps.length<2)throw Error('Маршрут состоит из одной точки.');
      map.getSource('route').setData(toFeatureCollection([{
        type:'Feature',properties:{},geometry:{type:'LineString',coordinates:gps}
      }]));
      const a=gameToGeo(first.X,first.Y),b=gameToGeo(last.X,last.Y);
      map.getSource('points').setData(toFeatureCollection([
        {type:'Feature',properties:{role:'start'},geometry:{type:'Point',coordinates:a}},
        {type:'Feature',properties:{role:'end'},geometry:{type:'Point',coordinates:b}}
      ]));
      const visible=new maplibregl.LngLatBounds(gps[0],gps[0]);
      for(const p of gps)visible.extend(p);
      map.fitBounds(visible,{padding:65,maxZoom:12,duration:650});
      status('routeStatus',first.Name+' → '+(last.Name||last.name||'выбранный объект')+
        ' · '+(result.meters/1000).toFixed(1)+' км · '+result.edges.length+' дорожных участков.');
    }catch(err){status('routeStatus','Маршрут не построен: '+err.message,true);}
  },20);
}
async function load(){
  const key=$('mapVariant').value,variant=MAPS[key];
  if(!variant)return;
  if(typeof maplibregl==='undefined'||typeof pmtiles==='undefined'||typeof proj4==='undefined'){
    status('mapStatus','Не удалось загрузить картографические библиотеки. Обнови страницу и проверь блокировщики.',true);return;
  }
  requestId++;const id=requestId;
  if(abort)abort.abort();abort=new AbortController();
  const signal=abort.signal;
  $('loadMap').disabled=true;$('routeBtn').disabled=true;
  graph=null;cities=[];poiTarget=null;
  $('fromCity').disabled=true;$('toCity').disabled=true;
  status('mapStatus','Открываю карту '+key+'…');
  status('routeStatus','Получаю готовый дорожный граф и список городов…');
  if(map){map.remove();map=null;}
  try{
    const protocol=new pmtiles.Protocol();
    if(!window.__ets2PmtilesRegistered){
      maplibregl.addProtocol('pmtiles',protocol.tile);
      window.__ets2PmtilesRegistered=true;
    }
    const url=BASE+'/vector/'+key+'.pmtiles?v='+variant.stamp;
    map=new maplibregl.Map({
      container:'map',style:style(url),center:variant.center,zoom:4.7,
      attributionControl:false,fadeDuration:0,minZoom:2,maxZoom:17
    });
    map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
    map.on('load',()=>{
      if(id!==requestId)return;
      addSymbols();
      $('mapHint').textContent='Колесо — приближение, перетаскивание — перемещение, щелчок по объекту — маршрут к нему.';
      status('mapStatus','Карта подключена: ETS2 '+variant.version+' · '+variant.built+
        '. Рендеринг из готовых данных, игровые файлы не нужны.');
      map.on('mouseenter','poi-icons',()=>map.getCanvas().style.cursor='pointer');
      map.on('mouseleave','poi-icons',()=>map.getCanvas().style.cursor='');
      map.on('click','poi-icons',event=>{
        const f=event.features?.[0];
        if(!f||f.geometry?.type!=='Point')return;
        const [X,Y]=geoToGame(...f.geometry.coordinates);
        const p=f.properties||{};
        poiTarget={Name:p.name||p.poiType||p.sprite||'Объект ETS2',X,Y};
        $('poiDestination').textContent='Пункт назначения: '+poiTarget.Name+
          '. Чтобы вернуться к городу, измени поле «Куда».';
        if(graph)drawRoute();
        else status('routeStatus','Загрузка графа ещё не завершена.');
      });
    });
    map.on('error',e=>{
      if(id!==requestId)return;
      const msg=String(e.error?.message||e.error||'');
      if(/PMTiles|CORS|fetch|Failed to load|Failed to fetch|403|404/i.test(msg)){
        status('mapStatus','Картографический сервер недоступен или запрещает загрузку: '+msg.slice(0,180),true);
      } else console.warn('MapLibre:',msg);
    });
    const [citiesResponse,graphResponse]=await Promise.all([
      fetch(BASE+'/'+key+'/Cities.json?v='+variant.stamp,{signal}),
      fetch(BASE+'/'+key+'/route-graph-'+key+'-v3.bin?v='+variant.stamp,{signal})
    ]);
    if(id!==requestId)return;
    if(!citiesResponse.ok)throw Error('Список городов: HTTP '+citiesResponse.status);
    if(!graphResponse.ok)throw Error('Дорожный граф: HTTP '+graphResponse.status);
    const [cityJSON,graphBytes]=await Promise.all([citiesResponse.json(),graphResponse.arrayBuffer()]);
    if(id!==requestId)return;
    cities=prepareCities(cityJSON);
    graph=window.ETS2RemoteGraph.parse(graphBytes);
    $('routeBtn').disabled=false;
    status('routeStatus','Загружено '+cities.length+' городов и '+graph.nodes.toLocaleString('ru-RU')+
      ' дорожных узлов. Выбери города или значок объекта.');
  }catch(err){
    if(id!==requestId)return;
    const msg=err?.name==='AbortError'?'Открытие отменено':String(err.message||err);
    status('mapStatus','Не удалось получить готовые данные. '+msg,true);
    status('routeStatus','Дорожный граф недоступен. Визуальная карта может продолжать работать.',true);
  }finally{if(id===requestId)$('loadMap').disabled=false;}
}
$('mapVariant').addEventListener('change',()=>{
  const selected=MAPS[$('mapVariant').value];
  $('variantInfo').textContent='Версия ETS2 '+selected.version+' · публикация '+selected.built+
    ($('mapVariant').value.includes('promods')?' · для модифицированной карты 1.61':'');
  $('mapHint').textContent='Нажми «Открыть готовую карту», чтобы сменить набор.';
});
$('loadMap').addEventListener('click',load);
$('routeBtn').addEventListener('click',drawRoute);
$('toCity').addEventListener('change',()=>{
  poiTarget=null;$('poiDestination').textContent='Пункт назначения: город '+(cities[Number($('toCity').value)]?.Name||'');
});
$('fromCity').addEventListener('change',()=>{if(graph)drawRoute();});
window.ETS2OnlineMapProjection={gameToGeo,geoToGame};
})();
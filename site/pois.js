/* Viewport-based ETS2 point-of-interest lookup. No GPS APIs or third-party tiles. */
(function (root, factory) {
  const lib=factory();
  root.ETS2POI=lib;
  if (typeof module==='object'&&module.exports)module.exports=lib;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const categories={
    fuel:{label:'Заправки',color:'#f7b35a',symbol:'F'},
    service:{label:'Ремонт',color:'#ea829a',symbol:'S'},
    parking:{label:'Стоянки и отдых',color:'#96b7fa',symbol:'P'},
    weigh:{label:'Весовые станции',color:'#ae96e9',symbol:'W'},
    dealer:{label:'Дилеры',color:'#ffcf8d',symbol:'D'},
    garage:{label:'Гаражи',color:'#90e1ba',symbol:'G'},
    recruitment:{label:'Агентства',color:'#7ac6dc',symbol:'H'},
    company:{label:'Предприятия / загрузка',color:'#dfbd9a',symbol:'C'},
    ferry:{label:'Паромы',color:'#80d4f6',symbol:'B'},
    train:{label:'Ж/д терминалы',color:'#d09cf5',symbol:'T'},
    viewpoint:{label:'Смотровые площадки',color:'#bde4a0',symbol:'V'},
    landmark:{label:'Достопримечательности',color:'#e8c39b',symbol:'L'}
  };
  function createIndex(pois,cellSize=12000){
    const grid=new Map();
    for(const poi of pois){
      const x=Math.floor(poi.x/cellSize),z=Math.floor(poi.z/cellSize);
      const k=x+':'+z;
      if(!grid.has(k))grid.set(k,[]);
      grid.get(k).push(poi);
    }
    function within(minX,minZ,maxX,maxZ,category='all',limit=900){
      const selected=[];
      const x0=Math.floor(minX/cellSize),x1=Math.floor(maxX/cellSize);
      const z0=Math.floor(minZ/cellSize),z1=Math.floor(maxZ/cellSize);
      for(let x=x0;x<=x1;x++){
        for(let z=z0;z<=z1;z++){
          const bucket=grid.get(x+':'+z);
          if(!bucket)continue;
          for(const poi of bucket){
            if(poi.x<minX||poi.x>maxX||poi.z<minZ||poi.z>maxZ)continue;
            if(category!=='all'&&poi.category!==category)continue;
            selected.push(poi);
            if(selected.length>=limit)return selected;
          }
        }
      }
      return selected;
    }
    return {within};
  }
  return {categories,createIndex};
});

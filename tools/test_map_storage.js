'use strict';
const assert = require('node:assert/strict');

// Minimal async IndexedDB mock for browser-independent regression testing.
const stores=new Map();
const db={
  objectStoreNames:{contains:name=>stores.has(name)},
  createObjectStore(name){stores.set(name,new Map());},
  close(){},
  transaction(storeName){
    const items=stores.get(storeName);
    assert.ok(items,'Missing IndexedDB store: '+storeName);
    const tx={oncomplete:null,onerror:null,onabort:null};
    tx.objectStore=()=>({
      put(entry){return query(()=>{items.set(entry.id,entry);return entry.id;});},
      get(key){return query(()=>items.get(key));},
      getAll(){return query(()=>Array.from(items.values()));},
      delete(key){return query(()=>{items.delete(key);return undefined;});},
    });
    function query(action){
      const r={result:undefined,onsuccess:null,onerror:null};
      queueMicrotask(()=>{
        try {r.result=action();r.onsuccess?.();tx.oncomplete?.();}
        catch(e){tx.error=e;r.onerror?.();tx.onerror?.();}
      });
      return r;
    }
    return tx;
  },
};
global.indexedDB={
  open(){
    const req={onsuccess:null,onerror:null,onblocked:null,onupgradeneeded:null,result:db};
    queueMicrotask(()=>{if(!stores.size)req.onupgradeneeded?.();req.onsuccess?.();});
    return req;
  }
};
require('../site/map-storage.js');
const storage=global.ETS2MapStorage;
assert.ok(storage);

(async()=>{
  const blob=new Blob(['{"format":"ets2-routepack-v1"}'],{type:'application/json'});
  await storage.save({id:'a',name:'ETS2 + DLC',blob,cities:333,savedAt:1000});
  await storage.save({id:'b',name:'ETS2 + ProMods',blob,cities:450,savedAt:2000});
  assert.equal((await storage.get('a')).cities,333);
  assert.equal(await (await storage.get('b')).blob.text(),await blob.text());
  const list=await storage.list();
  assert.deepEqual(list.map(i=>i.id),['b','a']);
  assert.equal(list[0].cities,450);
  assert.ok(!('blob' in list[0]),'listing should not expose binary data to UI');
  const cityBlob=new Blob(['GZIP TEST CONTENT'],{type:'application/gzip'});
  await storage.saveDetail('a',cityBlob);
  await storage.saveDetail('b',cityBlob);
  assert.equal(await (await storage.getDetail('a')).blob.text(),'GZIP TEST CONTENT');
  assert.equal((await storage.list()).length,2,'Detail files must not appear as map profiles');
  await storage.remove('b');
  assert.equal(await storage.getDetail('b'),undefined,'Deleting a profile must remove its detailed roads');
  assert.equal(await storage.get('b'),undefined);
  assert.deepEqual((await storage.list()).map(x=>x.id),['a']);
  console.log('Map storage tests passed: save, restore, multiple profiles, delete');
})().catch(e=>{console.error(e);process.exitCode=1;});

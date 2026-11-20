/* Browser-only ETS2 map profiles. Routepacks never leave this device. */
(function (root) {
  'use strict';
  const DB = 'ets2-navigator-offline-maps';
  const STORE = 'routepacks';
  const VERSION = 1;

  function database() {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) return reject(new Error('Браузер не поддерживает IndexedDB'));
      const request = root.indexedDB.open(DB, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      request.onerror = () => reject(request.error || new Error('Не удалось открыть хранилище карт'));
      request.onblocked = () => reject(new Error('Хранилище заблокировано другой вкладкой'));
      request.onsuccess = () => resolve(request.result);
    });
  }

  async function transaction(mode, callback) {
    const db = await database();
    return new Promise((resolve, reject) => {
      let result;
      let finished = false;
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      try {
        const req = callback(store);
        req.onsuccess = () => { result = req.result; };
        req.onerror = () => { /* transaction.onerror will reject */ };
      } catch (err) {
        tx.abort();
        db.close();
        reject(err);
        return;
      }
      tx.oncomplete = () => { if (!finished) { finished = true; db.close(); resolve(result); } };
      tx.onerror = tx.onabort = () => {
        if (!finished) { finished = true; db.close(); reject(tx.error || new Error('Не удалось сохранить карту')); }
      };
    });
  }

  async function save({ id, name, blob, cities, savedAt }) {
    if (!id || !name || !(blob instanceof Blob)) throw new Error('Некорректные данные карты');
    return transaction('readwrite', store => store.put({
      id, name: name.slice(0, 100), blob, cities: Number(cities) || 0,
      bytes: blob.size, savedAt: savedAt || Date.now(),
    }));
  }

  async function get(id) {
    return transaction('readonly', store => store.get(id));
  }

  async function list() {
    const records = await transaction('readonly', store => store.getAll());
    return records.map(({ id, name, cities, bytes, savedAt }) =>
      ({ id, name, cities, bytes, savedAt }))
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  async function remove(id) {
    return transaction('readwrite', store => store.delete(id));
  }

  root.ETS2MapStorage = { save, get, list, remove };
})(typeof window !== 'undefined' ? window : globalThis);

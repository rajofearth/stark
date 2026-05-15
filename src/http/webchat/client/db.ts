/* IndexedDB persistence layer (embedded as JS in the page) */
export const dbScript = `
/* ─── IndexedDB ─────────────────────────────────────────────────────────── */
let _db = null;

async function openDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('stark-webchat', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('conversations'))
        db.createObjectStore('conversations', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('messages')) {
        const ms = db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
        ms.createIndex('convId', 'convId', { unique: false });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

async function dbPutConv(conv) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('conversations', 'readwrite');
    tx.objectStore('conversations').put(conv);
    tx.oncomplete = () => res();
    tx.onerror = e => rej(e.target.error);
  });
}

async function dbAddMsg(msg) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('messages', 'readwrite');
    const req = tx.objectStore('messages').add(msg);
    req.onsuccess = () => res(req.result);
    req.onerror   = e => rej(e.target.error);
  });
}

async function dbGetMsgs(convId) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction('messages', 'readonly');
    const req = tx.objectStore('messages').index('convId').getAll(convId);
    req.onsuccess = () => res(req.result || []);
    req.onerror   = e => rej(e.target.error);
  });
}

async function dbClearMsgs(convId) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction('messages', 'readwrite');
    const req = tx.objectStore('messages').index('convId').openCursor(IDBKeyRange.only(convId));
    req.onsuccess = e => {
      const cur = e.target.result;
      if (cur) { cur.delete(); cur.continue(); } else res();
    };
    req.onerror = e => rej(e.target.error);
  });
}
`;

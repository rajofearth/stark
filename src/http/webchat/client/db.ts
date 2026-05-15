/* IndexedDB persistence layer (embedded as JS in the page) */
export const dbScript = `
/* ─── IndexedDB ─────────────────────────────────────────────────────────── */
let _db = null;

async function openDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('stark-webchat', 2);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('conversations'))
        db.createObjectStore('conversations', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('messages')) {
        const ms = db.createObjectStore('messages', { keyPath: 'id' });
        ms.createIndex('convId', 'convId', { unique: false });
      } else {
        const ms = e.target.transaction.objectStore('messages');
        if (!ms.indexNames.contains('convId')) ms.createIndex('convId', 'convId', { unique: false });
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

async function dbGetConvs() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('conversations', 'readonly');
    const req = tx.objectStore('conversations').getAll();
    req.onsuccess = () => res((req.result || []).sort((a,b) => convTs(b) - convTs(a)));
    req.onerror = e => rej(e.target.error);
  });
}

function convTs(conv) {
  const value = conv && conv.updatedAt;
  if (typeof value === 'number') return value;
  return Date.parse(value || '') || 0;
}

async function dbDeleteConv(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('conversations', 'readwrite');
    const req = tx.objectStore('conversations').delete(id);
    req.onsuccess = () => res();
    req.onerror = e => rej(e.target.error);
  });
}

async function dbGetConv(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('conversations', 'readonly');
    const req = tx.objectStore('conversations').get(id);
    req.onsuccess = () => res(req.result || null);
    req.onerror = e => rej(e.target.error);
  });
}

async function dbAddMsg(msg) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('messages', 'readwrite');
    const payload = Object.assign({ id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2) }, msg);
    const req = tx.objectStore('messages').put(payload);
    req.onsuccess = () => res(payload.id);
    req.onerror   = e => rej(e.target.error);
  });
}

async function dbPutMsg(msg) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('messages', 'readwrite');
    const req = tx.objectStore('messages').put(msg);
    req.onsuccess = () => res(msg.id);
    req.onerror   = e => rej(e.target.error);
  });
}

async function dbGetMsgs(convId) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction('messages', 'readonly');
    const req = tx.objectStore('messages').index('convId').getAll(convId);
    req.onsuccess = () => res((req.result || []).sort((a,b) => (a.ts||0) - (b.ts||0)));
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

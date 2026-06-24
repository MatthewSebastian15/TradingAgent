// AES-GCM over localStorage values; non-extractable device key in IndexedDB.
// XSS-equivalent: same-origin JS can still decrypt. Fix CSP first.
const DB = 'ta-secure',
  STORE = 'keys',
  KEY_ID = 'v1';

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readonly').objectStore(STORE).get(k);
    t.onsuccess = () => res(t.result);
    t.onerror = () => rej(t.error);
  });
}
async function idbSet(k, v) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readwrite').objectStore(STORE).put(v, k);
    t.onsuccess = () => res();
    t.onerror = () => rej(t.error);
  });
}
// ponytail: memoize the in-flight promise so concurrent encrypt/decrypt calls
// share one key generation. Without this, racing writers each generate a
// different key and persist blobs the survivor can't decrypt — silent data loss.
let keyPromise = null;
function getKey() {
  if (!keyPromise) {
    keyPromise = (async () => {
      let key = await idbGet(KEY_ID);
      if (!key) {
        key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
          'encrypt',
          'decrypt',
        ]);
        await idbSet(KEY_ID, key);
      }
      return key;
    })();
  }
  return keyPromise;
}
const enc = new TextEncoder(),
  dec = new TextDecoder();
const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptJSON(value) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(value))
  );
  return JSON.stringify({ v: 1, iv: b64(iv), ct: b64(ct) });
}
export async function decryptJSON(blob) {
  if (!blob) return null;
  try {
    const { iv, ct } = JSON.parse(blob);
    const key = await getKey();
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct));
    return JSON.parse(dec.decode(pt));
  } catch {
    return null;
  }
}

import type { PersistedSettings } from '../shared/types';

interface EncryptedEnvelope {
  version: 1;
  algorithm: 'AES-GCM';
  keyRef: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
}

const KEY_DB = 'teleton.web.crypto.v1';
const KEY_STORE = 'keys';
const RECORD_STORE = 'records';
const SETTINGS_KEY_REF = 'teleton.web.settings.v1';
const SESSION_RECORD_ID = 'teleton.web.session.v1';
const SETTINGS_STORAGE_KEY = 'teleton.web.settings.encrypted';

function requireBrowserStorage() {
  if (!('indexedDB' in globalThis) || !('crypto' in globalThis) || !globalThis.crypto.subtle) {
    throw new Error('Encrypted browser storage is unavailable.');
  }
}

function toBase64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function openDb() {
  requireBrowserStorage();

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(KEY_DB, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
      if (!db.objectStoreNames.contains(RECORD_STORE)) db.createObjectStore(RECORD_STORE);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open encrypted storage.'));
  });
}

async function idbGet<T>(storeName: string, key: string) {
  const db = await openDb();

  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error(`Unable to read ${storeName}.`));
    tx.oncomplete = () => db.close();
  });
}

async function idbSet<T>(storeName: string, key: string, value: T) {
  const db = await openDb();

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const request = tx.objectStore(storeName).put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Unable to write ${storeName}.`));
    tx.oncomplete = () => db.close();
  });
}

async function idbDelete(storeName: string, key: string) {
  const db = await openDb();

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const request = tx.objectStore(storeName).delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Unable to delete ${storeName}.`));
    tx.oncomplete = () => db.close();
  });
}

async function getOrCreateKey(keyRef = SETTINGS_KEY_REF) {
  const existing = await idbGet<CryptoKey>(KEY_STORE, keyRef);
  if (existing) return existing;

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await idbSet(KEY_STORE, keyRef, key);
  return key;
}

export async function encryptJson(value: unknown, keyRef = SETTINGS_KEY_REF): Promise<EncryptedEnvelope> {
  const key = await getOrCreateKey(keyRef);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded));

  return {
    version: 1,
    algorithm: 'AES-GCM',
    keyRef,
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(ciphertext),
    createdAt: new Date().toISOString()
  };
}

export async function decryptJson<T>(envelope: EncryptedEnvelope): Promise<T> {
  if (envelope.algorithm !== 'AES-GCM' || envelope.version !== 1) {
    throw new Error('Unsupported encrypted envelope.');
  }

  const key = await getOrCreateKey(envelope.keyRef);
  const iv = fromBase64Url(envelope.iv);
  const ciphertext = fromBase64Url(envelope.ciphertext);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export async function saveEncryptedSettings(settings: PersistedSettings) {
  const envelope = await encryptJson(settings);
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(envelope));
}

export async function loadEncryptedSettings() {
  const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) return null;

  return decryptJson<PersistedSettings>(JSON.parse(raw) as EncryptedEnvelope);
}

export async function clearEncryptedSettings() {
  localStorage.removeItem(SETTINGS_STORAGE_KEY);
}

export async function persistEncryptedSession(session: unknown, options: { consent: boolean }) {
  if (options.consent !== true) {
    throw new Error('Explicit consent is required before persisting a Telegram session.');
  }

  const envelope = await encryptJson(session, 'teleton.web.session.key.v1');
  await idbSet(RECORD_STORE, SESSION_RECORD_ID, envelope);
}

export async function loadEncryptedSession<T>() {
  const envelope = await idbGet<EncryptedEnvelope>(RECORD_STORE, SESSION_RECORD_ID);
  return envelope ? decryptJson<T>(envelope) : null;
}

export async function clearEncryptedSession() {
  await idbDelete(RECORD_STORE, SESSION_RECORD_ID);
}

const DB_NAME = 'peeklish';
const DB_VERSION = 2;

export type StoreName = 'expressions' | 'analysisCache' | 'translationCache' | 'documents' | 'annotations' | 'notes';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('expressions')) {
        const store = db.createObjectStore('expressions', { keyPath: 'id' });
        store.createIndex('canonical', 'canonical', { unique: true });
        store.createIndex('updatedAt', 'updatedAt');
      }
      for (const name of ['analysisCache', 'translationCache'] as const) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: 'key' });
          store.createIndex('lastUsedAt', 'lastUsedAt');
          store.createIndex('expiresAt', 'expiresAt');
        }
      }
      if (!db.objectStoreNames.contains('documents')) {
        const store = db.createObjectStore('documents', { keyPath: 'id' });
        store.createIndex('lastOpenedAt', 'lastOpenedAt');
      }
      if (!db.objectStoreNames.contains('annotations')) {
        const store = db.createObjectStore('annotations', { keyPath: 'id' });
        store.createIndex('docId', 'docId');
      }
      if (!db.objectStoreNames.contains('notes')) {
        const store = db.createObjectStore('notes', { keyPath: 'id' });
        store.createIndex('docId', 'docId');
        store.createIndex('annotationId', 'annotationId');
        store.createIndex('updatedAt', 'updatedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function withStore<T>(
  name: StoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(name, mode);
        const request = fn(tx.objectStore(name));
        tx.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

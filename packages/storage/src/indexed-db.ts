export type IndexedDbKey =
  | string
  | number
  | Date
  | ArrayBuffer
  | DataView<ArrayBuffer>
  | IndexedDbKey[];

export type IndexedDbValue = unknown;

export interface CreateIndexedDbStoreOptions {
  databaseName: string;
  storeName: string;
  version?: number;
}

export interface IndexedDbStore {
  get<T = IndexedDbValue>(key: IndexedDbKey): Promise<T | undefined>;
  set<T = IndexedDbValue>(key: IndexedDbKey, value: T): Promise<void>;
  delete(key: IndexedDbKey): Promise<void>;
}

function createUnavailableIndexedDbError(): Error {
  return new Error('IndexedDB is not available in this environment.');
}

function getIndexedDb(): IDBFactory {
  if (typeof globalThis.indexedDB === 'undefined') {
    throw createUnavailableIndexedDbError();
  }

  return globalThis.indexedDB;
}

function openDatabase(
  options: Required<CreateIndexedDbStoreOptions>,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = getIndexedDb().open(options.databaseName, options.version);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(options.storeName)) {
        database.createObjectStore(options.storeName);
      }
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open IndexedDB database.'));
    };

    request.onsuccess = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(options.storeName)) {
        database.close();
        reject(
          new Error(
            `IndexedDB object store "${options.storeName}" does not exist.`,
          ),
        );
        return;
      }

      resolve(database);
    };
  });
}

async function runTransaction<T>(
  options: Required<CreateIndexedDbStoreOptions>,
  mode: 'readonly' | 'readwrite',
  callback: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase(options);

  return new Promise((resolve, reject) => {
    let request: IDBRequest<T>;
    let result: T;

    try {
      const transaction = database.transaction(options.storeName, mode);
      const store = transaction.objectStore(options.storeName);
      request = callback(store);

      request.onsuccess = () => {
        result = request.result;
      };

      transaction.oncomplete = () => {
        database.close();
        resolve(result);
      };

      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
      };

      transaction.onabort = () => {
        database.close();
        reject(
          transaction.error ?? new Error('IndexedDB transaction aborted.'),
        );
      };
    } catch (error) {
      database.close();
      reject(
        error instanceof Error
          ? error
          : new Error('IndexedDB transaction setup failed.'),
      );
    }
  });
}

function normalizeOptions(
  options: CreateIndexedDbStoreOptions,
): Required<CreateIndexedDbStoreOptions> {
  return {
    version: 1,
    ...options,
  };
}

export function createIndexedDbStore(
  options: CreateIndexedDbStoreOptions,
): IndexedDbStore {
  const normalizedOptions = normalizeOptions(options);

  return {
    get<T = IndexedDbValue>(key: IndexedDbKey): Promise<T | undefined> {
      return getIndexedDbValue<T>(normalizedOptions, key);
    },
    set<T = IndexedDbValue>(key: IndexedDbKey, value: T): Promise<void> {
      return setIndexedDbValue<T>(normalizedOptions, key, value);
    },
    delete(key: IndexedDbKey): Promise<void> {
      return deleteIndexedDbValue(normalizedOptions, key);
    },
  };
}

export async function getIndexedDbValue<T = IndexedDbValue>(
  options: CreateIndexedDbStoreOptions,
  key: IndexedDbKey,
): Promise<T | undefined> {
  return runTransaction<T | undefined>(
    normalizeOptions(options),
    'readonly',
    (store) => store.get(key),
  );
}

export async function setIndexedDbValue<T = IndexedDbValue>(
  options: CreateIndexedDbStoreOptions,
  key: IndexedDbKey,
  value: T,
): Promise<void> {
  await runTransaction(normalizeOptions(options), 'readwrite', (store) =>
    store.put(value, key),
  );
}

export async function deleteIndexedDbValue(
  options: CreateIndexedDbStoreOptions,
  key: IndexedDbKey,
): Promise<void> {
  await runTransaction<undefined>(
    normalizeOptions(options),
    'readwrite',
    (store) => store.delete(key),
  );
}

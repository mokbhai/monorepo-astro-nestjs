export {
  createLocalStorageAdapter,
  localStorageAdapter,
  readLocalStorage,
  removeLocalStorage,
  writeLocalStorage,
} from './local-storage.js';
export type {
  LocalStorageAdapter,
  LocalStorageSerializer,
  ReadLocalStorageOptions,
  WriteLocalStorageOptions,
} from './local-storage.js';

export {
  createIndexedDbStore,
  deleteIndexedDbValue,
  getIndexedDbValue,
  setIndexedDbValue,
} from './indexed-db.js';
export type {
  CreateIndexedDbStoreOptions,
  IndexedDbKey,
  IndexedDbStore,
  IndexedDbValue,
} from './indexed-db.js';

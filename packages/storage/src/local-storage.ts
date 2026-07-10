export interface LocalStorageSerializer<T> {
  parse(value: string): T;
  stringify(value: T): string;
}

export interface ReadLocalStorageOptions<T> {
  serializer?: LocalStorageSerializer<T>;
  storage?: Storage;
}

export interface WriteLocalStorageOptions<T> {
  serializer?: Pick<LocalStorageSerializer<T>, 'stringify'>;
  storage?: Storage;
}

export interface LocalStorageAdapter {
  read<T>(key: string, fallback: T, options?: ReadLocalStorageOptions<T>): T;
  write<T>(key: string, value: T, options?: WriteLocalStorageOptions<T>): void;
  remove(key: string): void;
}

const jsonSerializer: LocalStorageSerializer<unknown> = {
  parse(value) {
    return JSON.parse(value) as unknown;
  },
  stringify(value) {
    return JSON.stringify(value);
  },
};

function getLocalStorage(storage?: Storage): Storage | undefined {
  if (storage) {
    return storage;
  }

  if (typeof globalThis.localStorage === 'undefined') {
    return undefined;
  }

  return globalThis.localStorage;
}

export function readLocalStorage<T>(
  key: string,
  fallback: T,
  options: ReadLocalStorageOptions<T> = {},
): T {
  const storage = getLocalStorage(options.storage);

  if (!storage) {
    return fallback;
  }

  try {
    const value = storage.getItem(key);

    if (value === null) {
      return fallback;
    }

    const serializer = options.serializer ?? jsonSerializer;

    return serializer.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function writeLocalStorage<T>(
  key: string,
  value: T,
  options: WriteLocalStorageOptions<T> = {},
): void {
  const storage = getLocalStorage(options.storage);

  if (!storage) {
    return;
  }

  const serializer = options.serializer ?? jsonSerializer;

  storage.setItem(key, serializer.stringify(value));
}

export function removeLocalStorage(key: string, storage?: Storage): void {
  const localStorage = getLocalStorage(storage);

  localStorage?.removeItem(key);
}

export function createLocalStorageAdapter(storage?: Storage): LocalStorageAdapter {
  return {
    read(key, fallback, options = {}) {
      return readLocalStorage(key, fallback, {
        ...options,
        storage: options.storage ?? storage,
      });
    },
    write(key, value, options = {}) {
      writeLocalStorage(key, value, {
        ...options,
        storage: options.storage ?? storage,
      });
    },
    remove(key) {
      removeLocalStorage(key, storage);
    },
  };
}

export const localStorageAdapter = createLocalStorageAdapter();

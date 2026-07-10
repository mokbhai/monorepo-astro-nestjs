import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLocalStorageAdapter,
  readLocalStorage,
  removeLocalStorage,
  writeLocalStorage,
} from '../dist/index.js';

class MemoryStorage {
  #values = new Map();

  get length() {
    return this.#values.size;
  }

  clear() {
    this.#values.clear();
  }

  getItem(key) {
    return this.#values.get(String(key)) ?? null;
  }

  key(index) {
    return Array.from(this.#values.keys())[index] ?? null;
  }

  removeItem(key) {
    this.#values.delete(String(key));
  }

  setItem(key, value) {
    this.#values.set(String(key), String(value));
  }
}

test('reads and writes JSON values in localStorage', () => {
  const storage = new MemoryStorage();

  assert.equal(
    writeLocalStorage('settings', { theme: 'dark' }, { storage }),
    true,
  );

  assert.deepEqual(
    readLocalStorage('settings', { theme: 'light' }, { storage }),
    {
      theme: 'dark',
    },
  );
});

test('returns fallback when localStorage key is missing or invalid', () => {
  const storage = new MemoryStorage();

  assert.equal(
    readLocalStorage('missing', 'fallback', { storage }),
    'fallback',
  );

  storage.setItem('invalid', '{');

  assert.equal(
    readLocalStorage('invalid', 'fallback', { storage }),
    'fallback',
  );
});

test('returns false when localStorage writes fail', () => {
  const storage = new MemoryStorage();

  storage.setItem = () => {
    throw new Error('storage unavailable');
  };

  assert.equal(
    writeLocalStorage('settings', { theme: 'dark' }, { storage }),
    false,
  );
});

test('supports custom localStorage serializers', () => {
  const storage = new MemoryStorage();
  const serializer = {
    parse: Number,
    stringify: String,
  };

  writeLocalStorage('count', 3, { serializer, storage });

  assert.equal(readLocalStorage('count', 0, { serializer, storage }), 3);
});

test('creates localStorage adapters with injected storage', () => {
  const storage = new MemoryStorage();
  const adapter = createLocalStorageAdapter(storage);

  assert.equal(adapter.write('enabled', true), true);

  assert.equal(adapter.read('enabled', false), true);

  adapter.remove('enabled');

  assert.equal(adapter.read('enabled', false), false);
});

test('removes localStorage values', () => {
  const storage = new MemoryStorage();

  assert.equal(writeLocalStorage('temporary', true, { storage }), true);
  removeLocalStorage('temporary', storage);

  assert.equal(readLocalStorage('temporary', false, { storage }), false);
});

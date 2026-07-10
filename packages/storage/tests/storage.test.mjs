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

  writeLocalStorage('settings', { theme: 'dark' }, { storage });

  assert.deepEqual(readLocalStorage('settings', { theme: 'light' }, { storage }), {
    theme: 'dark',
  });
});

test('returns fallback when localStorage key is missing or invalid', () => {
  const storage = new MemoryStorage();

  assert.equal(readLocalStorage('missing', 'fallback', { storage }), 'fallback');

  storage.setItem('invalid', '{');

  assert.equal(readLocalStorage('invalid', 'fallback', { storage }), 'fallback');
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

  adapter.write('enabled', true);

  assert.equal(adapter.read('enabled', false), true);

  adapter.remove('enabled');

  assert.equal(adapter.read('enabled', false), false);
});

test('removes localStorage values', () => {
  const storage = new MemoryStorage();

  writeLocalStorage('temporary', true, { storage });
  removeLocalStorage('temporary', storage);

  assert.equal(readLocalStorage('temporary', false, { storage }), false);
});

import '@testing-library/jest-dom/vitest';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

if (typeof window.localStorage?.getItem !== 'function') {
  Object.defineProperty(window, 'localStorage', {
    value: createMemoryStorage(),
    configurable: true,
  });
}

if (typeof window.sessionStorage?.getItem !== 'function') {
  Object.defineProperty(window, 'sessionStorage', {
    value: createMemoryStorage(),
    configurable: true,
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

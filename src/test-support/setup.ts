/**
 * Test environment shims.
 *
 * The jsdom build used here ships without `window.localStorage`, so any
 * suite touching it dies on `Cannot read properties of undefined`. That
 * is why `collection-manager.test.ts` had three permanently-red tests
 * long before this file existed — they were never broken code, only an
 * unimplemented environment.
 *
 * A plain in-memory implementation is enough: nothing under test needs
 * persistence across files, and each suite clears it in `beforeEach`.
 */

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

if (typeof window !== "undefined" && !window.localStorage) {
  Object.defineProperty(window, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
  });
}

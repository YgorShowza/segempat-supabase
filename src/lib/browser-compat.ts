declare global {
  interface Array<T> {
    findLastIndex(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: unknown): number;
    at(index: number): T | undefined;
  }
}

if (typeof Array.prototype.findLastIndex !== "function") {
  Object.defineProperty(Array.prototype, "findLastIndex", {
    configurable: true,
    writable: true,
    value: function findLastIndex<T>(this: T[], predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: unknown) {
      for (let index = this.length - 1; index >= 0; index -= 1) {
        if (predicate.call(thisArg, this[index] as T, index, this)) return index;
      }
      return -1;
    },
  });
}

if (typeof Array.prototype.at !== "function") {
  Object.defineProperty(Array.prototype, "at", {
    configurable: true,
    writable: true,
    value: function at<T>(this: T[], index: number) {
      const normalized = Math.trunc(index) || 0;
      const target = normalized < 0 ? this.length + normalized : normalized;
      if (target < 0 || target >= this.length) return undefined;
      return this[target];
    },
  });
}

export {};

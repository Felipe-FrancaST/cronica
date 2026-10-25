/** Small in-memory LRU cache. Concurrent consumers share one request. */
export class ResourceCache<T> {
  private entries = new Map<string, { expiresAt: number; promise: Promise<T> }>();
  constructor(
    private ttlMs: number,
    private capacity: number,
    private cacheable: (value: T) => boolean = () => true,
    private now: () => number = Date.now,
  ) {}
  clear() {
    this.entries.clear();
  }
  get(key: string, load: () => Promise<T>): Promise<T> {
    const previous = this.entries.get(key);
    if (previous && previous.expiresAt > this.now()) {
      this.entries.delete(key);
      this.entries.set(key, previous);
      return previous.promise;
    }
    if (previous) this.entries.delete(key);
    const entry = { expiresAt: this.now() + this.ttlMs, promise: Promise.resolve() as Promise<T> };
    entry.promise = Promise.resolve()
      .then(load)
      .then(
        (value) => {
          if (!this.cacheable(value) && this.entries.get(key) === entry) this.entries.delete(key);
          return value;
        },
        (error) => {
          if (this.entries.get(key) === entry) this.entries.delete(key);
          throw error;
        },
      );
    this.entries.set(key, entry);
    while (this.entries.size > Math.max(1, this.capacity))
      this.entries.delete(this.entries.keys().next().value!);
    return entry.promise;
  }
}

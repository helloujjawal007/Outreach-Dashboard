interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly maxEntries = 500;

  /**
   * Prunes expired entries and evicts oldest entries if above capacity.
   */
  private pruneIfNeeded(now: number): void {
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
    while (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break;
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Sets cached data with TTL in milliseconds (default: 3000ms / 3 seconds)
   */
  set<T>(key: string, data: T, ttlMs: number = 3000): void {
    const now = Date.now();
    if (!this.cache.has(key) && this.cache.size >= this.maxEntries) {
      this.pruneIfNeeded(now);
    }
    this.cache.set(key, {
      data,
      expiresAt: now + ttlMs,
    });
  }

  /**
   * Gets cached data if valid and not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Invalidates single key or keys matching prefix
   */
  invalidate(keyOrPrefix: string): void {
    if (this.cache.has(keyOrPrefix)) {
      this.cache.delete(keyOrPrefix);
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.startsWith(keyOrPrefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clears entire cache
   */
  clear(): void {
    this.cache.clear();
  }
}

export const fastCache = new MemoryCache();

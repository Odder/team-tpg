/**
 * Midpoint Cache - Hash-based caching system for midpoint calculations
 *
 * Caches calculated midpoints keyed by hash of both input CSVs.
 * This avoids recalculating expensive midpoint sets when the same
 * CSV combinations are used across sessions or pages.
 */

const MidpointCache = {
    /**
     * Storage key prefix for localStorage
     */
    STORAGE_PREFIX: 'tpg_midpoints_',

    /**
     * Maximum number of cached entries (LRU eviction)
     */
    MAX_ENTRIES: 20,

    /**
     * Fast hash function (djb2 algorithm)
     * @param {string} str - String to hash
     * @returns {string} Hash as hex string
     */
    hash(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
            hash = hash & hash; // Convert to 32-bit integer
        }
        // Convert to positive hex string
        return (hash >>> 0).toString(16);
    },

    /**
     * Generate cache key from two CSV contents
     * @param {string} csvA - First CSV content
     * @param {string} csvB - Second CSV content
     * @returns {string} Combined cache key
     */
    getCacheKey(csvA, csvB) {
        const hashA = this.hash(csvA);
        const hashB = this.hash(csvB);
        return `${hashA}_${hashB}`;
    },

    /**
     * Get cached midpoints
     * @param {string} cacheKey - Cache key from getCacheKey()
     * @returns {Array|null} Cached midpoints array or null if not found
     */
    get(cacheKey) {
        try {
            const raw = localStorage.getItem(this.STORAGE_PREFIX + cacheKey);
            if (!raw) return null;

            const data = JSON.parse(raw);

            // Update access time for LRU
            data.accessedAt = Date.now();
            localStorage.setItem(this.STORAGE_PREFIX + cacheKey, JSON.stringify(data));

            console.log(`MidpointCache: Hit for ${cacheKey} (${data.midpoints.length} midpoints)`);
            return data.midpoints;
        } catch (e) {
            console.warn('MidpointCache: Error reading cache:', e);
            return null;
        }
    },

    /**
     * Store midpoints in cache
     * @param {string} cacheKey - Cache key from getCacheKey()
     * @param {Array} midpoints - Array of {lat, lng} midpoints
     * @returns {boolean} Success status
     */
    set(cacheKey, midpoints) {
        try {
            // Enforce entry limit with LRU eviction
            this._evictIfNeeded();

            const data = {
                midpoints,
                createdAt: Date.now(),
                accessedAt: Date.now(),
                count: midpoints.length
            };

            localStorage.setItem(this.STORAGE_PREFIX + cacheKey, JSON.stringify(data));
            console.log(`MidpointCache: Stored ${midpoints.length} midpoints for ${cacheKey}`);
            return true;
        } catch (e) {
            // Storage might be full - try evicting more aggressively
            if (e.name === 'QuotaExceededError') {
                console.warn('MidpointCache: Storage full, evicting oldest entries...');
                this._evictOldest(5);
                try {
                    const data = {
                        midpoints,
                        createdAt: Date.now(),
                        accessedAt: Date.now(),
                        count: midpoints.length
                    };
                    localStorage.setItem(this.STORAGE_PREFIX + cacheKey, JSON.stringify(data));
                    return true;
                } catch (e2) {
                    console.error('MidpointCache: Still cannot store after eviction:', e2);
                }
            }
            console.warn('MidpointCache: Error writing cache:', e);
            return false;
        }
    },

    /**
     * Check if cache entry exists
     * @param {string} cacheKey - Cache key from getCacheKey()
     * @returns {boolean}
     */
    has(cacheKey) {
        return localStorage.getItem(this.STORAGE_PREFIX + cacheKey) !== null;
    },

    /**
     * Remove a specific cache entry
     * @param {string} cacheKey - Cache key from getCacheKey()
     */
    remove(cacheKey) {
        localStorage.removeItem(this.STORAGE_PREFIX + cacheKey);
    },

    /**
     * Clear all cached midpoints
     */
    clear() {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.STORAGE_PREFIX)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        console.log(`MidpointCache: Cleared ${keysToRemove.length} entries`);
    },

    /**
     * Get all cache entries with metadata
     * @returns {Array} Array of {key, count, createdAt, accessedAt}
     */
    list() {
        const entries = [];
        for (let i = 0; i < localStorage.length; i++) {
            const fullKey = localStorage.key(i);
            if (fullKey && fullKey.startsWith(this.STORAGE_PREFIX)) {
                try {
                    const data = JSON.parse(localStorage.getItem(fullKey));
                    entries.push({
                        key: fullKey.substring(this.STORAGE_PREFIX.length),
                        count: data.count || data.midpoints?.length || 0,
                        createdAt: data.createdAt,
                        accessedAt: data.accessedAt
                    });
                } catch (e) {
                    // Skip malformed entries
                }
            }
        }
        return entries;
    },

    /**
     * Get total cached midpoints count
     * @returns {number}
     */
    getTotalCount() {
        return this.list().reduce((sum, entry) => sum + entry.count, 0);
    },

    /**
     * Evict oldest entries if over limit
     * @private
     */
    _evictIfNeeded() {
        const entries = this.list();
        if (entries.length >= this.MAX_ENTRIES) {
            this._evictOldest(entries.length - this.MAX_ENTRIES + 1);
        }
    },

    /**
     * Evict N oldest entries (by accessedAt)
     * @param {number} count - Number of entries to evict
     * @private
     */
    _evictOldest(count) {
        const entries = this.list();
        entries.sort((a, b) => (a.accessedAt || 0) - (b.accessedAt || 0));

        const toEvict = entries.slice(0, count);
        toEvict.forEach(entry => {
            localStorage.removeItem(this.STORAGE_PREFIX + entry.key);
        });

        if (toEvict.length > 0) {
            console.log(`MidpointCache: Evicted ${toEvict.length} oldest entries`);
        }
    }
};

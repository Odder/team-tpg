/**
 * GeoWorker API - Interface for using the geo calculation web worker
 *
 * Usage:
 *   const results = await GeoWorkerAPI.findBestCombinations(pointsA, pointsB, target, {
 *       topN: 100,
 *       onProgress: (percent) => console.log(`${percent}%`)
 *   });
 */

const GeoWorkerAPI = {
    worker: null,
    pendingRequests: new Map(),
    requestId: 0,
    isReady: false,
    useWasm: false,

    // Threshold for using worker (combinations count)
    WORKER_THRESHOLD: 10000,

    /**
     * Initialize the worker
     */
    async init() {
        if (this.worker) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            try {
                this.worker = new Worker('./lib/geo-worker.js', { type: 'module' });

                this.worker.onmessage = (e) => {
                    const { type, id, data, progress, error, wasm } = e.data;

                    if (type === 'ready') {
                        this.isReady = true;
                        this.useWasm = wasm;
                        console.log(`GeoWorker ready (WASM: ${wasm})`);
                        resolve();
                        return;
                    }

                    if (type === 'progress') {
                        const request = this.pendingRequests.get(id);
                        if (request && request.onProgress) {
                            request.onProgress(progress);
                        }
                        return;
                    }

                    if (type === 'result') {
                        const request = this.pendingRequests.get(id);
                        if (request) {
                            request.resolve(data);
                            this.pendingRequests.delete(id);
                        }
                        return;
                    }

                    if (type === 'error') {
                        const request = this.pendingRequests.get(id);
                        if (request) {
                            request.reject(new Error(error));
                            this.pendingRequests.delete(id);
                        }
                        return;
                    }
                };

                this.worker.onerror = (e) => {
                    console.error('GeoWorker error:', e);
                    reject(e);
                };

                // Send init message
                this.worker.postMessage({ type: 'init' });

            } catch (e) {
                console.error('Failed to create GeoWorker:', e);
                reject(e);
            }
        });
    },

    /**
     * Check if worker should be used based on data size
     */
    shouldUseWorker(numA, numB) {
        return numA * numB >= this.WORKER_THRESHOLD;
    },

    /**
     * Find best combinations
     * @param {Array} pointsA - Array of {lat, lng, ...}
     * @param {Array} pointsB - Array of {lat, lng, ...}
     * @param {Object} target - Target {lat, lng}
     * @param {Object} options - { topN: 100, onProgress: fn }
     * @returns {Promise<{results, totalCombinations, elapsed}>}
     */
    async findBestCombinations(pointsA, pointsB, target, options = {}) {
        const { topN = 100, onProgress = null } = options;

        // Ensure worker is initialized
        await this.init();

        const id = ++this.requestId;

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject, onProgress });

            this.worker.postMessage({
                type: 'findBestCombinations',
                id,
                data: {
                    pointsA,
                    pointsB,
                    targetLat: target.lat,
                    targetLon: target.lng,
                    topN
                }
            });
        });
    },

    /**
     * Calculate all midpoints
     * @param {Array} pointsA - Array of {lat, lng, ...}
     * @param {Array} pointsB - Array of {lat, lng, ...}
     * @param {Object} options - { onProgress: fn }
     * @returns {Promise<{midpoints, elapsed}>}
     */
    async calculateAllMidpoints(pointsA, pointsB, options = {}) {
        const { onProgress = null } = options;

        // Ensure worker is initialized
        await this.init();

        const id = ++this.requestId;

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject, onProgress });

            this.worker.postMessage({
                type: 'calculateAllMidpoints',
                id,
                data: { pointsA, pointsB }
            });
        });
    },

    /**
     * Terminate the worker
     */
    terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            this.isReady = false;
            this.pendingRequests.clear();
        }
    }
};

// Auto-initialize if in browser context
if (typeof window !== 'undefined') {
    // Pre-initialize worker on page load
    window.addEventListener('load', () => {
        GeoWorkerAPI.init().catch(e => {
            console.warn('GeoWorker pre-initialization failed:', e);
        });
    });
}

/**
 * Web Worker for heavy geodesic calculations
 * Uses WASM for performance, falls back to JS if WASM unavailable
 */

let wasmModule = null;
let wasmReady = false;

// JS fallback implementations
const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
    return deg * Math.PI / 180;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const lat1Rad = toRad(lat1);
    const lat2Rad = toRad(lat2);
    const deltaLat = toRad(lat2 - lat1);
    const deltaLon = toRad(lon2 - lon1);

    const a = Math.sin(deltaLat / 2) ** 2 +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLon / 2) ** 2;

    const c = 2 * Math.asin(Math.sqrt(a));

    return EARTH_RADIUS_KM * c;
}

function geodesicMidpoint(lat1, lon1, lat2, lon2) {
    const lat1Rad = toRad(lat1);
    const lon1Rad = toRad(lon1);
    const lat2Rad = toRad(lat2);
    const lon2Rad = toRad(lon2);

    const deltaLon = lon2Rad - lon1Rad;

    const bx = Math.cos(lat2Rad) * Math.cos(deltaLon);
    const by = Math.cos(lat2Rad) * Math.sin(deltaLon);

    const latMid = Math.atan2(
        Math.sin(lat1Rad) + Math.sin(lat2Rad),
        Math.sqrt((Math.cos(lat1Rad) + bx) ** 2 + by ** 2)
    );

    const lonMid = lon1Rad + Math.atan2(by, Math.cos(lat1Rad) + bx);

    return [latMid * 180 / Math.PI, lonMid * 180 / Math.PI];
}

/**
 * Convert points array to flat Float64Array [lat0, lon0, lat1, lon1, ...]
 */
function pointsToFlat(points) {
    const flat = new Float64Array(points.length * 2);
    for (let i = 0; i < points.length; i++) {
        flat[i * 2] = points[i].lat;
        flat[i * 2 + 1] = points[i].lng;
    }
    return flat;
}

/**
 * Find best combinations using WASM
 */
function findBestCombinationsWASM(pointsA, pointsB, targetLat, targetLon, topN) {
    const flatA = pointsToFlat(pointsA);
    const flatB = pointsToFlat(pointsB);

    // Call WASM function
    const resultFlat = wasmModule.find_best_combinations(flatA, flatB, targetLat, targetLon, topN);

    // Parse results: [indexA, indexB, score, midLat, midLon, ...]
    const results = [];
    for (let i = 0; i < resultFlat.length; i += 5) {
        results.push({
            indexA: Math.round(resultFlat[i]),
            indexB: Math.round(resultFlat[i + 1]),
            score: resultFlat[i + 2],
            midpoint: { lat: resultFlat[i + 3], lng: resultFlat[i + 4] }
        });
    }

    return results;
}

/**
 * Calculate all midpoints using WASM
 */
function calculateAllMidpointsWASM(pointsA, pointsB) {
    const flatA = pointsToFlat(pointsA);
    const flatB = pointsToFlat(pointsB);

    // Call WASM function
    const resultFlat = wasmModule.calculate_all_midpoints(flatA, flatB);

    // Parse results: [lat0, lon0, lat1, lon1, ...]
    const midpoints = [];
    for (let i = 0; i < resultFlat.length; i += 2) {
        midpoints.push({ lat: resultFlat[i], lng: resultFlat[i + 1] });
    }

    return midpoints;
}

/**
 * Find best combinations using JS (fallback)
 */
function findBestCombinationsJS(pointsA, pointsB, targetLat, targetLon, topN, progressCallback) {
    const results = [];
    const total = pointsA.length * pointsB.length;
    let processed = 0;
    let lastProgress = 0;

    for (let i = 0; i < pointsA.length; i++) {
        const latA = pointsA[i].lat;
        const lonA = pointsA[i].lng;

        for (let j = 0; j < pointsB.length; j++) {
            const latB = pointsB[j].lat;
            const lonB = pointsB[j].lng;

            // Calculate midpoint
            const [midLat, midLon] = geodesicMidpoint(latA, lonA, latB, lonB);

            // Calculate score
            const score = haversineDistance(midLat, midLon, targetLat, targetLon);

            results.push({
                indexA: i,
                indexB: j,
                score,
                midpoint: { lat: midLat, lng: midLon }
            });

            processed++;

            // Report progress every 1%
            const progress = Math.floor((processed / total) * 100);
            if (progress > lastProgress) {
                lastProgress = progress;
                progressCallback(progress);
            }
        }
    }

    // Sort by score
    results.sort((a, b) => a.score - b.score);

    return results.slice(0, topN);
}

/**
 * Calculate all midpoints using JS (fallback)
 */
function calculateAllMidpointsJS(pointsA, pointsB, progressCallback) {
    const midpoints = [];
    const total = pointsA.length * pointsB.length;
    let processed = 0;
    let lastProgress = 0;

    for (let i = 0; i < pointsA.length; i++) {
        const latA = pointsA[i].lat;
        const lonA = pointsA[i].lng;

        for (let j = 0; j < pointsB.length; j++) {
            const latB = pointsB[j].lat;
            const lonB = pointsB[j].lng;

            const [midLat, midLon] = geodesicMidpoint(latA, lonA, latB, lonB);

            midpoints.push({ lat: midLat, lng: midLon });

            processed++;

            const progress = Math.floor((processed / total) * 100);
            if (progress > lastProgress) {
                lastProgress = progress;
                progressCallback(progress);
            }
        }
    }

    return midpoints;
}

// Load WASM module
async function initWasm() {
    try {
        // Fetch and compile the WASM module
        const wasmUrl = new URL('../wasm-geo/pkg/geo_wasm_bg.wasm', self.location.href).href;
        const response = await fetch(wasmUrl);
        const wasmBytes = await response.arrayBuffer();

        // Import the JS bindings
        const jsBindingsUrl = new URL('../wasm-geo/pkg/geo_wasm.js', self.location.href).href;
        const module = await import(jsBindingsUrl);

        // Initialize the WASM module
        await module.default(wasmBytes);

        wasmModule = module;
        wasmReady = true;

        console.log('WASM module loaded successfully');
        self.postMessage({ type: 'ready', wasm: true });
    } catch (e) {
        console.warn('WASM not available, using JS fallback:', e.message);
        wasmReady = false;
        self.postMessage({ type: 'ready', wasm: false });
    }
}

// Handle messages from main thread
self.onmessage = async function(e) {
    const { type, data, id } = e.data;

    if (type === 'init') {
        await initWasm();
        return;
    }

    if (type === 'findBestCombinations') {
        const { pointsA, pointsB, targetLat, targetLon, topN } = data;

        const progressCallback = (progress) => {
            self.postMessage({ type: 'progress', id, progress });
        };

        try {
            const startTime = performance.now();
            let results;

            if (wasmReady) {
                // Use WASM (no progress callback - it's fast enough)
                progressCallback(0);
                results = findBestCombinationsWASM(pointsA, pointsB, targetLat, targetLon, topN);
                progressCallback(100);
            } else {
                // Use JS fallback with progress
                results = findBestCombinationsJS(pointsA, pointsB, targetLat, targetLon, topN, progressCallback);
            }

            const elapsed = performance.now() - startTime;

            self.postMessage({
                type: 'result',
                id,
                data: {
                    results,
                    totalCombinations: pointsA.length * pointsB.length,
                    elapsed,
                    usedWasm: wasmReady
                }
            });
        } catch (error) {
            self.postMessage({ type: 'error', id, error: error.message });
        }
    }

    if (type === 'calculateAllMidpoints') {
        const { pointsA, pointsB } = data;

        const progressCallback = (progress) => {
            self.postMessage({ type: 'progress', id, progress });
        };

        try {
            const startTime = performance.now();
            let midpoints;

            if (wasmReady) {
                // Use WASM
                progressCallback(0);
                midpoints = calculateAllMidpointsWASM(pointsA, pointsB);
                progressCallback(100);
            } else {
                // Use JS fallback
                midpoints = calculateAllMidpointsJS(pointsA, pointsB, progressCallback);
            }

            const elapsed = performance.now() - startTime;

            self.postMessage({
                type: 'result',
                id,
                data: {
                    midpoints,
                    elapsed,
                    usedWasm: wasmReady
                }
            });
        } catch (error) {
            self.postMessage({ type: 'error', id, error: error.message });
        }
    }
};

// Auto-initialize
initWasm();

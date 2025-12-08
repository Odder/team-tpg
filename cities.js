/**
 * City Combination Finder
 * Finds the best city pairs where both players have visited,
 * ranked by midpoint distance to a target coordinate.
 *
 * Supports multiple datasets (top200, full).
 */

const GRID_SIZE = 5;         // Degrees per grid cell (must match build script)

const DATASETS = {
    top200: {
        dir: './midpoint-grid-top200',
        name: 'Top 200 cities'
    },
    full: {
        dir: './midpoint-grid',
        name: 'Full (1000+ cities)'
    }
};

// Current dataset
let currentDataset = 'top200';
let cities = [];
let gridIndex = {};
let gridCache = new Map();

// State
let combinations = [];
let selectedComboIndex = null;
let isReady = false;

// Map and layers
let map = null;
let layers = {};

/**
 * Get current grid directory
 */
function getGridDir() {
    return DATASETS[currentDataset].dir;
}

/**
 * Load cities and grid index for current dataset
 */
async function loadData() {
    const gridDir = getGridDir();

    try {
        const [citiesRes, indexRes] = await Promise.all([
            fetch(`${gridDir}/cities.json`),
            fetch(`${gridDir}/index.json`)
        ]);

        cities = await citiesRes.json();
        gridIndex = await indexRes.json();
        gridCache = new Map(); // Clear cache when switching datasets

        console.log(`Loaded ${cities.length} cities, ${Object.keys(gridIndex).length} grid cells from ${currentDataset}`);
        return true;
    } catch (error) {
        console.error('Error loading data:', error);
        return false;
    }
}

/**
 * Load a grid file (with caching)
 */
async function loadGridFile(gridKey) {
    const cacheKey = `${currentDataset}_${gridKey}`;

    if (gridCache.has(cacheKey)) {
        return gridCache.get(cacheKey);
    }

    try {
        const res = await fetch(`${getGridDir()}/grid_${gridKey}.json`);
        const data = await res.json();
        gridCache.set(cacheKey, data);
        return data;
    } catch (error) {
        console.error(`Error loading grid ${gridKey}:`, error);
        return [];
    }
}

/**
 * Get grid cell key for a coordinate
 */
function getGridKey(lat, lng) {
    const latBucket = Math.floor((lat + 90) / GRID_SIZE);
    const lngBucket = Math.floor((lng + 180) / GRID_SIZE);
    return `${latBucket}_${lngBucket}`;
}

/**
 * Get all grid keys within a radius of a target
 */
function getNearbyGridKeys(lat, lng, radiusKm) {
    const keys = [];

    const latDelta = radiusKm / 111;
    const lngDelta = radiusKm / (111 * Math.cos(lat * Math.PI / 180));

    const minLat = lat - latDelta;
    const maxLat = lat + latDelta;
    const minLng = lng - lngDelta;
    const maxLng = lng + lngDelta;

    const minLatBucket = Math.floor((minLat + 90) / GRID_SIZE);
    const maxLatBucket = Math.floor((maxLat + 90) / GRID_SIZE);
    const minLngBucket = Math.floor((minLng + 180) / GRID_SIZE);
    const maxLngBucket = Math.floor((maxLng + 180) / GRID_SIZE);

    for (let latB = minLatBucket; latB <= maxLatBucket; latB++) {
        for (let lngB = minLngBucket; lngB <= maxLngBucket; lngB++) {
            let normalizedLngB = lngB;
            const maxLngBuckets = Math.ceil(360 / GRID_SIZE);
            if (normalizedLngB < 0) normalizedLngB += maxLngBuckets;
            if (normalizedLngB >= maxLngBuckets) normalizedLngB -= maxLngBuckets;

            const key = `${latB}_${normalizedLngB}`;
            if (gridIndex[key]) {
                keys.push(key);
            }
        }
    }

    return keys;
}

/**
 * Initialize the map
 */
function initMap() {
    map = MapUtils.createMap('map');
    layers = MapUtils.createLayers(map, ['city', 'target', 'highlight']);
    MapUtils.addContextMenu(map);
}

/**
 * Parse coordinate input (delegates to CoordUtils)
 */
function parseCoordinates(input) {
    return CoordUtils.parse(input);
}

/**
 * Calculate distance between two points (delegates to CoordUtils)
 */
function getDistance(lat1, lng1, lat2, lng2) {
    return CoordUtils.distance({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });
}

/**
 * Format distance for display (delegates to CoordUtils)
 */
function formatDistance(km) {
    return CoordUtils.formatDistance(km);
}

/**
 * Find best combinations by loading relevant grid files
 */
async function findBestCombinations(target, maxResults = 50) {
    console.time('Search');

    const searchRadii = [500, 1000, 2000, 5000, 10000, 20000];
    let allCandidates = [];

    for (const radius of searchRadii) {
        const nearbyKeys = getNearbyGridKeys(target.lat, target.lng, radius);

        if (nearbyKeys.length === 0) continue;

        const gridPromises = nearbyKeys.map(key => loadGridFile(key));
        const gridData = await Promise.all(gridPromises);

        allCandidates = [];
        for (const pairs of gridData) {
            for (const pair of pairs) {
                allCandidates.push(pair);
            }
        }

        console.log(`Radius ${radius}km: ${nearbyKeys.length} grid cells, ${allCandidates.length} candidates`);

        if (allCandidates.length >= maxResults) {
            break;
        }
    }

    const results = allCandidates.map(pair => {
        const [idxA, idxB, midLat, midLng, distAtoB] = pair;
        const score = getDistance(target.lat, target.lng, midLat, midLng);
        return {
            cityA: { name: cities[idxA].n, lat: cities[idxA].lat, lng: cities[idxA].lng },
            cityB: { name: cities[idxB].n, lat: cities[idxB].lat, lng: cities[idxB].lng },
            midpoint: { lat: midLat, lng: midLng },
            distAtoB: distAtoB,
            score: score
        };
    });

    results.sort((a, b) => a.score - b.score);
    combinations = results.slice(0, maxResults);

    console.timeEnd('Search');
    console.log(`Returning top ${combinations.length} results`);

    return combinations;
}

/**
 * Display combinations in the list
 */
function displayCombinations() {
    const listContainer = document.getElementById('combination-list');

    if (combinations.length === 0) {
        listContainer.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px;">No combinations found</p>';
        return;
    }

    listContainer.innerHTML = '';

    combinations.forEach((combo, rank) => {
        const item = document.createElement('div');
        item.className = 'combination-item';
        if (rank === selectedComboIndex) {
            item.classList.add('selected');
        }

        item.innerHTML = `
            <div>
                <span class="combination-rank">${rank + 1}</span>
                <span class="combination-score">Score: ${formatDistance(combo.score)}</span>
            </div>
            <div class="combination-cities">
                <span class="city-badge">1</span> ${combo.cityA.name}<br>
                <span class="city-badge">2</span> ${combo.cityB.name}
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 6px;">
                Distance between: ${formatDistance(combo.distAtoB)}
            </div>
        `;

        item.addEventListener('click', () => {
            selectedComboIndex = rank;
            displayCombinations();
            highlightCombination(combo);
        });

        listContainer.appendChild(item);
    });
}

/**
 * Highlight a combination on the map
 */
function highlightCombination(combo) {
    layers.highlight.clearLayers();

    MapUtils.drawMarker(layers.highlight, combo.cityA, {
        radius: 12,
        color: MapUtils.colors.green,
        fillColor: MapUtils.colors.green,
        fillOpacity: 0.8
    }, `<strong>${combo.cityA.name}</strong>`);

    MapUtils.drawMarker(layers.highlight, combo.cityB, {
        radius: 12,
        color: MapUtils.colors.green,
        fillColor: MapUtils.colors.green,
        fillOpacity: 0.8
    }, `<strong>${combo.cityB.name}</strong>`);

    const googleMapsUrl = CoordUtils.googleMapsUrl(combo.midpoint.lat, combo.midpoint.lng);

    MapUtils.drawMarker(layers.highlight, combo.midpoint, {
        radius: 10,
        color: MapUtils.colors.yellow,
        fillColor: MapUtils.colors.yellow,
        fillOpacity: 0.9
    }, `
        <strong>Midpoint</strong><br>
        ${combo.cityA.name} &harr; ${combo.cityB.name}<br>
        <br>
        Lat: ${combo.midpoint.lat.toFixed(6)}<br>
        Lng: ${combo.midpoint.lng.toFixed(6)}<br>
        <br>
        Score: ${formatDistance(combo.score)} from target<br>
        <br>
        <a href="${googleMapsUrl}" target="_blank" style="color: #3498db;">Open in Google Maps</a>
    `);

    MapUtils.drawGreatCircle(layers.highlight, combo.cityA, combo.cityB, {
        color: MapUtils.colors.green,
        opacity: 0.6
    });

    MapUtils.fitToPoints(map, [combo.cityA, combo.cityB, combo.midpoint]);
}

/**
 * Draw all cities on the map
 */
function drawAllCities() {
    layers.city.clearLayers();

    cities.forEach((city) => {
        MapUtils.drawMarker(layers.city, city, {
            radius: 6,
            color: MapUtils.colors.blue,
            fillColor: MapUtils.colors.blue,
            fillOpacity: 0.6,
            weight: 2
        }, `<strong>${city.n}</strong>`);
    });
}

/**
 * Draw target point
 */
function drawTarget(target) {
    layers.target.clearLayers();

    MapUtils.drawMarker(layers.target, target, {
        color: MapUtils.colors.red,
        fillColor: MapUtils.colors.red,
        fillOpacity: 0.9
    }, `<strong>Target</strong><br>Lat: ${target.lat.toFixed(4)}<br>Lng: ${target.lng.toFixed(4)}`);
}

/**
 * Main find function
 */
async function findCombinations() {
    if (!isReady) {
        alert('Still loading... please wait.');
        return;
    }

    const targetInput = document.getElementById('target-coords').value;

    const target = parseCoordinates(targetInput);
    if (!target) {
        alert('Invalid target coordinates. Please enter lat, lng (e.g., 40.7128, -74.0060)');
        return;
    }

    // Save target for other pages
    CoordUtils.saveTarget(targetInput);

    const listContainer = document.getElementById('combination-list');
    listContainer.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px;">Searching...</p>';

    drawTarget(target);

    await findBestCombinations(target, 50);
    displayCombinations();

    if (combinations.length > 0) {
        selectedComboIndex = 0;
        displayCombinations();
        highlightCombination(combinations[0]);
    }
}

/**
 * Switch dataset
 */
async function switchDataset(dataset) {
    if (dataset === currentDataset) return;

    currentDataset = dataset;
    isReady = false;

    updateStatus(`Loading ${DATASETS[dataset].name}...`);

    const loaded = await loadData();
    if (!loaded) {
        updateStatus(`Error loading ${dataset}. Run: node build-midpoints.js`);
        return;
    }

    // Update stats
    document.getElementById('city-count').textContent = cities.length;
    const pairCount = (cities.length * (cities.length - 1)) / 2;
    document.getElementById('pair-count').textContent = pairCount.toLocaleString();

    // Redraw cities
    drawAllCities();

    // Clear previous results
    combinations = [];
    selectedComboIndex = null;
    layers.highlight.clearLayers();

    isReady = true;
    updateStatus(`Ready! ${DATASETS[dataset].name} loaded (${Object.keys(gridIndex).length} grid cells).`);

    // Re-run search if target is set
    const targetInput = document.getElementById('target-coords').value;
    if (targetInput && parseCoordinates(targetInput)) {
        findCombinations();
    }
}

/**
 * Load target coordinates from URL hash
 */
function loadFromUrlHash() {
    const hash = window.location.hash.substring(1);
    if (!hash) return false;

    const coords = parseCoordinates(hash);
    if (coords) {
        document.getElementById('target-coords').value = hash;
        findCombinations();
        return true;
    }
    return false;
}

/**
 * Update loading status
 */
function updateStatus(message) {
    const listContainer = document.getElementById('combination-list');
    listContainer.innerHTML = `<p style="color: var(--text-secondary); font-size: 13px;">${message}</p>`;
}

/**
 * Initialize application
 */
async function init() {
    // Render navigation
    NavUtils.render('site-nav', 'cities');

    initMap();

    updateStatus('Loading pre-computed data...');

    // Load initial dataset (top200)
    const loaded = await loadData();
    if (!loaded) {
        updateStatus('Error loading data. Run: node build-midpoints.js');
        return;
    }

    // Update stats
    document.getElementById('city-count').textContent = cities.length;
    const pairCount = (cities.length * (cities.length - 1)) / 2;
    document.getElementById('pair-count').textContent = pairCount.toLocaleString();

    // Draw all cities
    drawAllCities();

    // Event listeners
    document.getElementById('find-btn').addEventListener('click', findCombinations);

    document.getElementById('target-coords').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            findCombinations();
        }
    });

    // Dataset selector
    document.getElementById('dataset-select').addEventListener('change', (e) => {
        switchDataset(e.target.value);
    });

    isReady = true;
    updateStatus(`Ready! ${DATASETS[currentDataset].name} loaded. Enter coordinates above.`);

    // Load from URL hash if present, otherwise load saved target
    if (!loadFromUrlHash()) {
        const savedTarget = CoordUtils.loadTarget();
        if (savedTarget) {
            document.getElementById('target-coords').value = savedTarget;
        }
    }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

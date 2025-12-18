/**
 * Combination Finder - Find best spot pairs for a target
 */

// Data storage
let pointsA = [];
let pointsB = [];
let combinations = [];
let selectedComboIndex = null;

// Map and layers
let map = null;
let layers = {};
let midpointClusterGroup = null;
let rawMidpointLayer = L.layerGroup();
let heatmapLayer = L.layerGroup();
let heatmapV2Layer = null;
let midpointSpatialIndex = null;
let allMidpoints = []; // Cache for all calculated midpoints

/**
 * Initialize the map
 */
function initMap() {
    map = MapUtils.createMap('map');
    layers = MapUtils.createLayers(map, ['pointsA', 'pointsB', 'target', 'highlight']);
    MapUtils.addContextMenu(map);
    // heatmapLayer added on-demand
}

/**
 * Load points from a CSV file (delegates to DataLoader)
 */
async function loadPoints(filename) {
    return await DataLoader.loadCSV(filename, { defaultTitle: true });
}

/**
 * Parse coordinate input (delegates to CoordUtils)
 */
function parseCoordinates(input) {
    return CoordUtils.parse(input);
}

/**
 * Calculate score for a combination
 * Score = how close the target is to being the midpoint between pointA and pointB
 */
function calculateCombinationScore(pointA, pointB, target) {
    // Calculate actual midpoint between A and B
    const aTurf = turf.point([pointA.lng, pointA.lat]);
    const bTurf = turf.point([pointB.lng, pointB.lat]);
    const actualMidpoint = turf.midpoint(aTurf, bTurf);

    const midpoint = {
        lat: actualMidpoint.geometry.coordinates[1],
        lng: actualMidpoint.geometry.coordinates[0]
    };

    // Calculate distance from actual midpoint to target
    const score = GeoCalc.getDistance(midpoint, target);

    // Also calculate distances for display
    const distAtoTarget = GeoCalc.getDistance(pointA, target);
    const distBtoTarget = GeoCalc.getDistance(pointB, target);
    const distAtoB = GeoCalc.getDistance(pointA, pointB);

    return {
        score: score,
        midpoint: midpoint,
        distAtoTarget: distAtoTarget,
        distBtoTarget: distBtoTarget,
        distAtoB: distAtoB
    };
}

/**
 * Find and rank all combinations (sync version for small datasets)
 */
function findBestCombinationsSync(target) {
    combinations = [];

    pointsA.forEach((pointA, indexA) => {
        pointsB.forEach((pointB, indexB) => {
            const result = calculateCombinationScore(pointA, pointB, target);

            combinations.push({
                pointA: pointA,
                pointB: pointB,
                indexA: indexA,
                indexB: indexB,
                score: result.score,
                midpoint: result.midpoint,
                distAtoTarget: result.distAtoTarget,
                distBtoTarget: result.distBtoTarget,
                distAtoB: result.distAtoB
            });
        });
    });

    // Sort by score (ascending - lower is better)
    combinations.sort((a, b) => a.score - b.score);

    return combinations;
}

/**
 * Find and rank combinations using Web Worker (for large datasets)
 */
async function findBestCombinationsAsync(target, onProgress) {
    const totalCombos = pointsA.length * pointsB.length;
    console.log(`Using Web Worker for ${totalCombos.toLocaleString()} combinations...`);

    const result = await GeoWorkerAPI.findBestCombinations(
        pointsA,
        pointsB,
        target,
        {
            topN: 1000, // Get top 1000 for display flexibility
            onProgress
        }
    );

    // Convert worker results back to full combination objects
    combinations = result.results.map(r => {
        const pointA = pointsA[r.indexA];
        const pointB = pointsB[r.indexB];

        return {
            pointA: pointA,
            pointB: pointB,
            indexA: r.indexA,
            indexB: r.indexB,
            score: r.score,
            midpoint: r.midpoint,
            distAtoTarget: GeoCalc.getDistance(pointA, target),
            distBtoTarget: GeoCalc.getDistance(pointB, target),
            distAtoB: GeoCalc.getDistance(pointA, pointB)
        };
    });

    console.log(`Worker completed in ${(result.elapsed / 1000).toFixed(2)}s`);
    return combinations;
}

/**
 * Display combinations in the list
 */
function displayCombinations() {
    const listContainer = document.getElementById('combination-list');
    const countSpan = document.getElementById('count-combos');

    countSpan.textContent = combinations.length;

    if (combinations.length === 0) {
        listContainer.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px;">No combinations found</p>';
        return;
    }

    listContainer.innerHTML = '';

    // Show top 50 combinations
    const topCombos = combinations.slice(0, 50);

    topCombos.forEach((combo, rank) => {
        const item = document.createElement('div');
        item.className = 'combination-item';
        if (rank === selectedComboIndex) {
            item.classList.add('selected');
        }

        item.innerHTML = `
            <div>
                <span class="combination-rank">${rank + 1}</span>
                <span class="combination-score">Score: ${GeoCalc.formatDistance(combo.score)}</span>
            </div>
            <div class="combination-spots">
                <span class="spot-badge spot-a">A</span> ${combo.pointA.title}<br>
                <span class="spot-badge spot-b">B</span> ${combo.pointB.title}
            </div>
        `;

        item.addEventListener('click', () => {
            selectedComboIndex = rank;
            displayCombinations();
            highlightCombination(combo);
        });

        listContainer.appendChild(item);
    });

    if (combinations.length > 50) {
        const moreInfo = document.createElement('p');
        moreInfo.style.cssText = 'color: var(--text-secondary); font-size: 12px; padding: 8px; text-align: center;';
        moreInfo.textContent = `Showing top 50 of ${combinations.length} combinations`;
        listContainer.appendChild(moreInfo);
    }
}

/**
 * Highlight a combination on the map
 */
function highlightCombination(combo) {
    layers.highlight.clearLayers();

    // Draw point A (blue)
    const circleA = L.circle([combo.pointA.lat, combo.pointA.lng], {
        radius: combo.pointA.radius,
        color: '#3498db',
        fillColor: '#3498db',
        fillOpacity: 0.4,
        weight: 4
    });
    circleA.bindPopup(`<strong>Point A: ${combo.pointA.title}</strong><br>Radius: ${(combo.pointA.radius / 1000).toFixed(0)} km`);
    circleA.addTo(layers.highlight);

    // Draw point B (purple)
    const circleB = L.circle([combo.pointB.lat, combo.pointB.lng], {
        radius: combo.pointB.radius,
        color: MapUtils.colors.purple,
        fillColor: MapUtils.colors.purple,
        fillOpacity: 0.4,
        weight: 4
    });
    circleB.bindPopup(`<strong>Point B: ${combo.pointB.title}</strong><br>Radius: ${(combo.pointB.radius / 1000).toFixed(0)} km`);
    circleB.addTo(layers.highlight);

    // Draw midpoint (yellow)
    const midpointMarker = L.circleMarker([combo.midpoint.lat, combo.midpoint.lng], {
        radius: 10,
        color: '#f1c40f',
        fillColor: '#f1c40f',
        fillOpacity: 0.9,
        weight: 3
    });

    const googleMapsUrl = `https://www.google.com/maps?q=${combo.midpoint.lat},${combo.midpoint.lng}`;

    midpointMarker.bindPopup(`
        <strong>Actual Midpoint (A↔B)</strong><br>
        Lat: ${combo.midpoint.lat.toFixed(6)}<br>
        Lng: ${combo.midpoint.lng.toFixed(6)}<br>
        <br>
        Score: ${GeoCalc.formatDistance(combo.score)} from target<br>
        <br>
        <a href="${googleMapsUrl}" target="_blank" style="color: #3498db;">Open in Google Maps</a>
    `);
    midpointMarker.addTo(layers.highlight);

    // Draw line A to B
    MapUtils.drawGreatCircle(layers.highlight, combo.pointA, combo.pointB);
}

/**
 * Draw all points on the map
 */
function drawAllPoints() {
    layers.pointsA.clearLayers();
    layers.pointsB.clearLayers();

    // Draw A points (blue)
    pointsA.forEach((point, index) => {
        MapUtils.drawCircle(layers.pointsA, point, {
            color: MapUtils.colors.blue,
            fillColor: MapUtils.colors.blue,
            fillOpacity: 0.1,
            weight: 1
        }, `<strong>A${index + 1}: ${point.title}</strong>`);
    });

    // Draw B points (purple)
    pointsB.forEach((point, index) => {
        MapUtils.drawCircle(layers.pointsB, point, {
            color: MapUtils.colors.purple,
            fillColor: MapUtils.colors.purple,
            fillOpacity: 0.1,
            weight: 1
        }, `<strong>B${index + 1}: ${point.title}</strong>`);
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
 * Show/hide progress indicator
 */
function showProgress(show, message = 'Calculating...', percent = null) {
    let progressEl = document.getElementById('calc-progress');

    if (!progressEl && show) {
        // Create progress element if it doesn't exist
        progressEl = document.createElement('div');
        progressEl.id = 'calc-progress';
        progressEl.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--secondary-bg);
            padding: 24px 48px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            z-index: 10000;
            text-align: center;
            min-width: 250px;
        `;
        document.body.appendChild(progressEl);
    }

    if (progressEl) {
        if (show) {
            const percentText = percent !== null ? ` (${percent}%)` : '';
            progressEl.innerHTML = `
                <div style="font-size: 16px; font-weight: 600; margin-bottom: 12px; color: var(--text-primary);">
                    ${message}${percentText}
                </div>
                <div style="width: 100%; height: 8px; background: var(--accent); border-radius: 4px; overflow: hidden;">
                    <div style="width: ${percent || 0}%; height: 100%; background: var(--green); transition: width 0.2s;"></div>
                </div>
            `;
            progressEl.style.display = 'block';
        } else {
            progressEl.style.display = 'none';
        }
    }
}

/**
 * Main find function
 */
async function findCombinations() {
    const targetInput = document.getElementById('target-coords').value;

    const target = parseCoordinates(targetInput);
    if (!target) {
        alert('Invalid target coordinates');
        return;
    }

    // Save target for other pages
    CoordUtils.saveTarget(targetInput);

    if (pointsA.length === 0 || pointsB.length === 0) {
        alert('Please upload both List A and List B files first');
        return;
    }

    // Draw all points
    drawAllPoints();
    drawTarget(target);

    // Determine if we should use the worker (threshold: 10,000 combinations)
    const totalCombos = pointsA.length * pointsB.length;
    const useWorker = totalCombos >= 10000;

    if (useWorker) {
        // Show progress for large datasets
        showProgress(true, 'Calculating combinations...', 0);

        try {
            await findBestCombinationsAsync(target, (percent) => {
                showProgress(true, 'Calculating combinations...', percent);
            });
        } finally {
            showProgress(false);
        }
    } else {
        // Use sync version for small datasets
        findBestCombinationsSync(target);
    }

    displayCombinations();

    // Auto-select and highlight the best combination
    if (combinations.length > 0) {
        selectedComboIndex = 0;
        displayCombinations();
        highlightCombination(combinations[0]);
    }
}

/**
 * Show all midpoint combinations as clustered markers
 */
function showAllMidpoints() {
    if (pointsA.length === 0 || pointsB.length === 0) {
        alert('Please load both point lists first');
        return;
    }

    // Remove existing cluster group if present
    if (midpointClusterGroup) {
        map.removeLayer(midpointClusterGroup);
    }

    // Create new marker cluster group
    midpointClusterGroup = L.markerClusterGroup({
        maxClusterRadius: 10,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true
    });

    let count = 0;
    const totalCombos = pointsA.length * pointsB.length;

    console.log(`Calculating ${totalCombos} midpoints...`);

    // Calculate and add all midpoints
    pointsA.forEach((pointA, indexA) => {
        pointsB.forEach((pointB, indexB) => {
            // Calculate midpoint
            const aTurf = turf.point([pointA.lng, pointA.lat]);
            const bTurf = turf.point([pointB.lng, pointB.lat]);
            const midpointTurf = turf.midpoint(aTurf, bTurf);

            const midpoint = {
                lat: midpointTurf.geometry.coordinates[1],
                lng: midpointTurf.geometry.coordinates[0]
            };

            // Create small marker for this midpoint
            const marker = L.circleMarker([midpoint.lat, midpoint.lng], {
                radius: 5,
                color: '#f1c40f',
                fillColor: '#f1c40f',
                fillOpacity: 0.6,
                weight: 1
            });

            marker.bindPopup(`
                <strong>Midpoint</strong><br>
                <span class="spot-badge spot-a" style="background: #3498db; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px;">A</span> ${pointA.title}<br>
                <span class="spot-badge spot-b" style="background: #9b59b6; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px;">B</span> ${pointB.title}<br>
                <br>
                Lat: ${midpoint.lat.toFixed(6)}<br>
                Lng: ${midpoint.lng.toFixed(6)}
            `);

            midpointClusterGroup.addLayer(marker);
            count++;
        });
    });

    // Add to map
    map.addLayer(midpointClusterGroup);

    console.log(`Added ${count} midpoint markers to cluster`);
    alert(`Displaying ${count} midpoint combinations as clustered markers`);
}

/**
 * Show all midpoint combinations as individual raw markers (NO clustering)
 * WARNING: This can be slow with many points!
 */
function showRawMidpoints() {
    if (pointsA.length === 0 || pointsB.length === 0) {
        alert('Please load both point lists first');
        return;
    }

    const totalCombos = pointsA.length * pointsB.length;

    // Confirm if many points
    if (totalCombos > 10000) {
        if (!confirm(`This will render ${totalCombos.toLocaleString()} individual markers without clustering.\n\nThis may cause performance issues. Continue?`)) {
            return;
        }
    }

    // Remove other visualization layers
    if (midpointClusterGroup) map.removeLayer(midpointClusterGroup);
    if (map.hasLayer(heatmapLayer)) map.removeLayer(heatmapLayer);

    // Clear existing raw midpoint layer
    rawMidpointLayer.clearLayers();
    map.addLayer(rawMidpointLayer);

    console.log(`Rendering ${totalCombos} raw midpoints...`);
    console.time('Raw Midpoint Rendering');

    let count = 0;
    let lastLogTime = Date.now();

    // Calculate and add all midpoints as individual markers
    pointsA.forEach((pointA, indexA) => {
        pointsB.forEach((pointB, indexB) => {
            // Calculate midpoint
            const aTurf = turf.point([pointA.lng, pointA.lat]);
            const bTurf = turf.point([pointB.lng, pointB.lat]);
            const midpointTurf = turf.midpoint(aTurf, bTurf);

            const midpoint = {
                lat: midpointTurf.geometry.coordinates[1],
                lng: midpointTurf.geometry.coordinates[0]
            };

            // Create tiny marker for this midpoint
            const marker = L.circleMarker([midpoint.lat, midpoint.lng], {
                radius: 2,
                color: '#f1c40f',
                fillColor: '#f1c40f',
                fillOpacity: 0.7,
                weight: 0
            });

            marker.bindPopup(`
                <strong>Midpoint</strong><br>
                <span class="spot-badge spot-a" style="background: #3498db; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px;">A</span> ${pointA.title}<br>
                <span class="spot-badge spot-b" style="background: #9b59b6; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px;">B</span> ${pointB.title}<br>
                <br>
                Lat: ${midpoint.lat.toFixed(6)}<br>
                Lng: ${midpoint.lng.toFixed(6)}
            `);

            marker.addTo(rawMidpointLayer);
            count++;

            // Progress logging every 2 seconds
            const now = Date.now();
            if (now - lastLogTime > 2000) {
                console.log(`  Rendered ${count}/${totalCombos} midpoints...`);
                lastLogTime = now;
            }
        });
    });

    console.timeEnd('Raw Midpoint Rendering');
    console.log(`✓ Rendered ${count} raw midpoint markers`);
    alert(`Rendered ${count.toLocaleString()} individual midpoint markers`);
}

/**
 * Get tile key for bucketing
 * Uses FIXED global grid in lat/lng space to ensure tiles align properly
 */
function getTileKey(lat, lng, latStep, lngStep) {
    const tileLatIndex = Math.floor((lat + 90) / latStep);
    const tileLngIndex = Math.floor((lng + 180) / lngStep);
    return `${tileLatIndex},${tileLngIndex}`;
}

/**
 * Get tile center from key
 * Returns center coordinates for a tile in the global grid
 */
function getTileCenterFromKey(key, latStep, lngStep) {
    const [latIndex, lngIndex] = key.split(',').map(Number);
    const lat = -90 + (latIndex + 0.5) * latStep;
    const lng = -180 + (lngIndex + 0.5) * lngStep;
    return { lat, lng };
}

/**
 * Get physical dimensions of a tile at a given latitude
 */
function getTileDimensions(lat, latStep, lngStep) {
    // Latitude dimension is always ~111km per degree
    const heightKm = latStep * 111;

    // Longitude dimension varies with latitude
    const latRad = lat * Math.PI / 180;
    const widthKm = lngStep * 111 * Math.cos(latRad);

    return { heightKm, widthKm };
}

/**
 * Get neighbor tile keys with distance-aware categorization
 * Returns array of {key, distance} objects
 * Distances calculated based on actual physical dimensions at this latitude
 */
function getNeighborKeysWithDistance(key, latStep, lngStep) {
    const [latIndex, lngIndex] = key.split(',').map(Number);
    const lat = -90 + (latIndex + 0.5) * latStep;

    // Get actual physical dimensions at this latitude
    const { heightKm, widthKm } = getTileDimensions(lat, latStep, lngStep);

    // Calculate distances (center to center)
    const verticalDist = heightKm;
    const horizontalDist = widthKm;
    const diagonalDist = Math.sqrt(verticalDist * verticalDist + horizontalDist * horizontalDist);

    return [
        { key: `${latIndex - 1},${lngIndex}`, distance: verticalDist },     // top
        { key: `${latIndex + 1},${lngIndex}`, distance: verticalDist },     // bottom
        { key: `${latIndex},${lngIndex - 1}`, distance: horizontalDist },   // left
        { key: `${latIndex},${lngIndex + 1}`, distance: horizontalDist },   // right
        { key: `${latIndex - 1},${lngIndex - 1}`, distance: diagonalDist }, // top-left
        { key: `${latIndex - 1},${lngIndex + 1}`, distance: diagonalDist }, // top-right
        { key: `${latIndex + 1},${lngIndex - 1}`, distance: diagonalDist }, // bottom-left
        { key: `${latIndex + 1},${lngIndex + 1}`, distance: diagonalDist }  // bottom-right
    ];
}

/**
 * Generate coverage heatmap with ~50×50km tiles
 * Uses FIXED global lat/lng grid to ensure proper alignment
 * Tiles are square in degree-space, varying in physical size with latitude
 */
async function generateHeatmap() {
    if (pointsA.length === 0 || pointsB.length === 0) {
        alert('Please load both point lists first');
        return;
    }

    console.time('Heatmap Generation');

    // Hide other layers for performance
    if (midpointClusterGroup) map.removeLayer(midpointClusterGroup);
    if (heatmapV2Layer) {
        map.removeLayer(heatmapV2Layer);
        heatmapV2Layer = null;
    }
    map.removeLayer(layers.pointsA);
    map.removeLayer(layers.pointsB);
    map.removeLayer(layers.highlight);

    // Clear existing heatmap
    heatmapLayer.clearLayers();
    map.addLayer(heatmapLayer);

    // STEP 1: Calculate all midpoints if not already cached
    if (allMidpoints.length === 0) {
        const totalCombos = pointsA.length * pointsB.length;
        const useWorker = totalCombos >= 10000;

        if (useWorker) {
            showProgress(true, 'Calculating midpoints...', 0);
            try {
                const result = await GeoWorkerAPI.calculateAllMidpoints(
                    pointsA,
                    pointsB,
                    {
                        onProgress: (percent) => {
                            showProgress(true, 'Calculating midpoints...', percent);
                        }
                    }
                );
                allMidpoints = result.midpoints;
                console.log(`✓ Worker calculated ${allMidpoints.length} midpoints in ${(result.elapsed / 1000).toFixed(2)}s`);
            } finally {
                showProgress(false);
            }
        } else {
            console.log('Step 1: Calculating all midpoints...');
            pointsA.forEach((pointA) => {
                pointsB.forEach((pointB) => {
                    const aTurf = turf.point([pointA.lng, pointA.lat]);
                    const bTurf = turf.point([pointB.lng, pointB.lat]);
                    const midpointTurf = turf.midpoint(aTurf, bTurf);

                    allMidpoints.push({
                        lat: midpointTurf.geometry.coordinates[1],
                        lng: midpointTurf.geometry.coordinates[0]
                    });
                });
            });
            console.log(`✓ Calculated ${allMidpoints.length} midpoints`);
        }
    }

    // Use FIXED global grid with 100km tiles for performance
    // This creates a ~180×360 grid instead of 400×800
    const tileSize = 100; // km (approximate, at equator)
    const latStep = tileSize / 111; // degrees (~0.9°)
    const lngStep = tileSize / 111; // degrees (~0.9°) - FIXED globally

    // STEP 2: Assign midpoints to buckets (green tiles with distance 0)
    console.log('Step 2: Bucketing midpoints into tiles...');
    const tileGrid = new Map(); // Maps tile key -> color
    const tileDistances = new Map(); // Maps tile key -> distance from nearest midpoint

    allMidpoints.forEach(midpoint => {
        const key = getTileKey(midpoint.lat, midpoint.lng, latStep, lngStep);
        tileGrid.set(key, 'green');
        tileDistances.set(key, 0);
    });
    console.log(`✓ Created ${tileGrid.size} green tiles`);

    // STEP 3: Distance-aware flood-fill
    console.log('Step 3: Distance-aware flood-fill expansion...');

    // Queue of tiles to process: [key, cumulativeDistance]
    const queue = Array.from(tileGrid.keys()).map(k => [k, 0]);
    const inQueue = new Set(queue.map(([k]) => k)); // Track tiles already in queue
    let queueIndex = 0;
    let lastLogTime = Date.now();
    const MAX_TILES = 500000; // Safety limit to prevent memory issues

    while (queueIndex < queue.length) {
        const [currentKey, currentDist] = queue[queueIndex];
        queueIndex++;

        // Safety check to prevent runaway growth
        if (tileGrid.size > MAX_TILES) {
            console.warn(`⚠ Hit safety limit of ${MAX_TILES} tiles, stopping expansion`);
            break;
        }

        // Progress logging every 2 seconds
        const now = Date.now();
        if (now - lastLogTime > 2000) {
            console.log(`  Processing: ${queueIndex}/${queue.length} tiles (${tileGrid.size} colored)`);
            lastLogTime = now;
        }

        // Get neighbors with their step distances (accounting for latitude-dependent tile size)
        const neighbors = getNeighborKeysWithDistance(currentKey, latStep, lngStep);

        neighbors.forEach(({ key: neighborKey, distance: stepDist }) => {
            const newDist = currentDist + stepDist;

            // Skip if beyond max distance (reduced to 400km for performance)
            if (newDist >= 400) {
                return;
            }

            // Skip if this tile already has a shorter or equal distance
            if (tileDistances.has(neighborKey) && tileDistances.get(neighborKey) <= newDist) {
                return;
            }

            // Determine color based on distance
            let color = null;
            if (newDist < 100) {
                color = 'yellow';
            } else if (newDist < 250) {
                color = 'orange';
            } else {
                color = 'red';
            }

            // Update or add this tile
            const existingColor = tileGrid.get(neighborKey);

            // Don't overwrite green (midpoint) tiles
            if (existingColor !== 'green') {
                tileGrid.set(neighborKey, color);
                tileDistances.set(neighborKey, newDist);

                // Add to queue only if not already queued
                if (!inQueue.has(neighborKey)) {
                    queue.push([neighborKey, newDist]);
                    inQueue.add(neighborKey);
                }
            }
        });
    }

    console.log(`✓ Flood-fill complete: processed ${queueIndex} tiles`);

    console.log(`✓ Yellow tiles (<100km): ${Array.from(tileGrid.values()).filter(c => c === 'yellow').length}`);
    console.log(`✓ Orange tiles (<250km): ${Array.from(tileGrid.values()).filter(c => c === 'orange').length}`);
    console.log(`✓ Red tiles (<500km): ${Array.from(tileGrid.values()).filter(c => c === 'red').length}`);

    // STEP 4: Render all tiles
    console.log('Step 4: Rendering tiles...');
    let renderedCount = 0;

    tileGrid.forEach((color, key) => {
        // Get tile center
        const { lat, lng } = getTileCenterFromKey(key, latStep, lngStep);

        // Tiles are rectangles in lat/lng space
        const bounds = [
            [lat - latStep / 2, lng - lngStep / 2],
            [lat + latStep / 2, lng + lngStep / 2]
        ];

        const colorMap = {
            'green': { color: '#2ecc71', opacity: 0.5 },
            'yellow': { color: '#f1c40f', opacity: 0.4 },
            'orange': { color: '#e67e22', opacity: 0.35 },
            'red': { color: '#e74c3c', opacity: 0.3 }
        };

        const style = colorMap[color];

        const rect = L.rectangle(bounds, {
            color: style.color,
            fillColor: style.color,
            fillOpacity: style.opacity,
            weight: 0,
            interactive: false
        });

        rect.addTo(heatmapLayer);
        renderedCount++;
    });

    console.log(`✓ Rendered ${renderedCount} colored tiles`);
    console.timeEnd('Heatmap Generation');

    alert(`Heatmap generated!\n\n${renderedCount} tiles rendered (100×100km each)\n\nGreen: midpoint inside\nYellow: <100km\nOrange: <250km\nRed: <400km`);
}

// ============================================================
// NEW HEATMAP V2 - Canvas-based with smooth gradient
// Pre-computed distance field + bilinear interpolation
// ============================================================

// Distance field storage
let distanceField = null;
let distanceFieldMeta = null;

/**
 * Fast haversine distance calculation (km)
 */
function haversineDistanceFast(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Build a pre-computed distance field grid
 * Resolution: ~25km cells (0.25 degrees)
 * Returns a Promise to allow async progress updates
 */
function buildDistanceField(midpoints, resolution = 0.25, onProgress = null) {
    return new Promise((resolve) => {
        const latMin = -85, latMax = 85;
        const lngMin = -180, lngMax = 180;

        const latCells = Math.ceil((latMax - latMin) / resolution);
        const lngCells = Math.ceil((lngMax - lngMin) / resolution);

        console.log(`Building distance field: ${latCells}x${lngCells} = ${latCells * lngCells} cells`);

        // Create typed array for distances (much faster than regular array)
        const field = new Float32Array(latCells * lngCells);
        field.fill(Infinity);

        // First pass: mark cells containing midpoints as 0
        midpoints.forEach(mp => {
            if (mp.lat < latMin || mp.lat > latMax) return;

            const latIdx = Math.floor((mp.lat - latMin) / resolution);
            const lngIdx = Math.floor(((mp.lng + 180) % 360 - 180 - lngMin) / resolution);

            if (latIdx >= 0 && latIdx < latCells && lngIdx >= 0 && lngIdx < lngCells) {
                const idx = latIdx * lngCells + lngIdx;
                field[idx] = 0;
            }
        });

        // Build spatial index for fast nearest-neighbor during field computation
        const cellSize = 2; // degrees
        const spatialIndex = new Map();
        midpoints.forEach((mp, i) => {
            const key = `${Math.floor(mp.lat / cellSize)},${Math.floor(mp.lng / cellSize)}`;
            if (!spatialIndex.has(key)) spatialIndex.set(key, []);
            spatialIndex.get(key).push(i);
        });

        // Second pass: compute distances for all cells (chunked for progress)
        const maxSearchDist = 1600; // km (a bit beyond 1500 for safety)
        const maxSearchDegLat = maxSearchDist / 111 + 1;

        let currentLatIdx = 0;
        const chunkSize = 10; // Process 10 rows per chunk

        function processChunk() {
            const endLatIdx = Math.min(currentLatIdx + chunkSize, latCells);

            for (let latIdx = currentLatIdx; latIdx < endLatIdx; latIdx++) {
                const lat = latMin + (latIdx + 0.5) * resolution;

                // Adjust longitude search radius based on latitude
                // At higher latitudes, need to search more longitude cells
                const cosLat = Math.cos(Math.abs(lat) * Math.PI / 180);
                const maxSearchDegLng = cosLat > 0.1 ? maxSearchDegLat / cosLat : 180;
                const searchRadiusLat = Math.ceil(maxSearchDegLat / cellSize);
                const searchRadiusLng = Math.min(Math.ceil(maxSearchDegLng / cellSize), 90); // Cap at 180 degrees

                for (let lngIdx = 0; lngIdx < lngCells; lngIdx++) {
                    const idx = latIdx * lngCells + lngIdx;

                    // Skip cells that already have midpoints
                    if (field[idx] === 0) continue;

                    const lng = lngMin + (lngIdx + 0.5) * resolution;

                    // Search nearby cells in spatial index
                    const centerCellLat = Math.floor(lat / cellSize);
                    const centerCellLng = Math.floor(lng / cellSize);

                    let minDist = Infinity;

                    for (let dLat = -searchRadiusLat; dLat <= searchRadiusLat && minDist > 50; dLat++) {
                        for (let dLng = -searchRadiusLng; dLng <= searchRadiusLng; dLng++) {
                            // Handle antimeridian wrapping for longitude
                            let cellLng = centerCellLng + dLng;
                            // Wrap longitude cells (assuming 2-degree cells, 180 cells for 360 degrees)
                            const maxLngCells = Math.ceil(360 / cellSize);
                            if (cellLng < -maxLngCells / 2) cellLng += maxLngCells;
                            if (cellLng >= maxLngCells / 2) cellLng -= maxLngCells;

                            const key = `${centerCellLat + dLat},${cellLng}`;
                            const cellMps = spatialIndex.get(key);

                            if (cellMps) {
                                for (const mpIdx of cellMps) {
                                    const mp = midpoints[mpIdx];
                                    const dist = haversineDistanceFast(lat, lng, mp.lat, mp.lng);
                                    if (dist < minDist) minDist = dist;
                                }
                            }
                        }
                    }

                    field[idx] = Math.min(minDist, maxSearchDist);
                }
            }

            currentLatIdx = endLatIdx;

            // Report progress
            if (onProgress) {
                const percent = Math.round((currentLatIdx / latCells) * 100);
                onProgress(percent);
            }

            if (currentLatIdx < latCells) {
                // Continue with next chunk (yield to event loop)
                setTimeout(processChunk, 0);
            } else {
                // Done - log stats and resolve with the field
                let zeros = 0, finite = 0, infinite = 0;
                for (let i = 0; i < field.length; i++) {
                    if (field[i] === 0) zeros++;
                    else if (field[i] < 10000) finite++;
                    else infinite++;
                }
                console.log(`Distance field stats: zeros=${zeros}, finite=${finite}, infinite=${infinite}`);

                resolve({
                    field,
                    latMin,
                    latMax,
                    lngMin,
                    lngMax,
                    latCells,
                    lngCells,
                    resolution
                });
            }
        }

        // Start processing
        processChunk();
    });
}

/**
 * Sample distance from pre-computed field with bilinear interpolation
 * Handles antimeridian wrapping for longitude
 */
function sampleDistanceField(lat, lng, meta) {
    const { field, latMin, latMax, lngMin, lngMax, latCells, lngCells, resolution } = meta;

    // Clamp to valid range
    if (lat < latMin || lat > latMax) return Infinity;

    // Normalize longitude to -180 to 180
    lng = ((lng + 180) % 360 + 360) % 360 - 180;

    // Get floating point cell coordinates
    const latF = (lat - latMin) / resolution - 0.5;
    const lngF = (lng - lngMin) / resolution - 0.5;

    // Get integer cell indices
    const latIdx0 = Math.floor(latF);
    const latIdx1 = latIdx0 + 1;
    let lngIdx0 = Math.floor(lngF);
    let lngIdx1 = lngIdx0 + 1;

    // Get interpolation weights
    const latT = latF - latIdx0;
    const lngT = lngF - lngIdx0;

    // Clamp latitude indices
    const lat0 = Math.max(0, Math.min(latCells - 1, latIdx0));
    const lat1 = Math.max(0, Math.min(latCells - 1, latIdx1));

    // Wrap longitude indices (for antimeridian)
    const lng0 = ((lngIdx0 % lngCells) + lngCells) % lngCells;
    const lng1 = ((lngIdx1 % lngCells) + lngCells) % lngCells;

    // Sample four corners
    const d00 = field[lat0 * lngCells + lng0];
    const d01 = field[lat0 * lngCells + lng1];
    const d10 = field[lat1 * lngCells + lng0];
    const d11 = field[lat1 * lngCells + lng1];

    // Bilinear interpolation
    const d0 = d00 * (1 - lngT) + d01 * lngT;
    const d1 = d10 * (1 - lngT) + d11 * lngT;

    return d0 * (1 - latT) + d1 * latT;
}

/**
 * Convert distance to color
 * Green @40% (center) -> Yellow @40% (~150km) -> Red @40% (~750km) -> Red @0% (~1500km)
 * Returns [r, g, b, a] array
 */
function distanceToColor(distKm) {
    const YELLOW_DIST = 75;
    const RED_DIST = 500;
    const MAX_DIST = 1000;
    const BASE_OPACITY = 102; // 0-255, ~40% opacity

    // Colors
    const GREEN = [46, 204, 113];   // #2ecc71
    const YELLOW = [241, 196, 15];  // #f1c40f
    const RED = [231, 76, 60];      // #e74c3c

    if (distKm > MAX_DIST) {
        return [0, 0, 0, 0]; // Transparent
    }

    let r, g, b, opacity;

    if (distKm <= YELLOW_DIST) {
        // Green to Yellow (0 -> 150km)
        const t = distKm / YELLOW_DIST;
        r = Math.round(GREEN[0] + (YELLOW[0] - GREEN[0]) * t);
        g = Math.round(GREEN[1] + (YELLOW[1] - GREEN[1]) * t);
        b = Math.round(GREEN[2] + (YELLOW[2] - GREEN[2]) * t);
        opacity = BASE_OPACITY;
    } else if (distKm <= RED_DIST) {
        // Yellow to Red (150 -> 750km)
        const t = (distKm - YELLOW_DIST) / (RED_DIST - YELLOW_DIST);
        r = Math.round(YELLOW[0] + (RED[0] - YELLOW[0]) * t);
        g = Math.round(YELLOW[1] + (RED[1] - YELLOW[1]) * t);
        b = Math.round(YELLOW[2] + (RED[2] - YELLOW[2]) * t);
        opacity = BASE_OPACITY;
    } else {
        // Red, fading opacity (750 -> 1500km)
        const t = (distKm - RED_DIST) / (MAX_DIST - RED_DIST);
        r = RED[0];
        g = RED[1];
        b = RED[2];
        opacity = Math.round(BASE_OPACITY * (1 - t));
    }

    return [r, g, b, opacity];
}

/**
 * Custom Leaflet GridLayer for heatmap rendering
 * Uses pre-computed distance field with bilinear interpolation
 */
function createHeatmapGridLayer(fieldMeta) {
    const HeatmapGridLayer = L.GridLayer.extend({
        options: {
            fieldMeta: null
        },

        initialize: function(options) {
            L.GridLayer.prototype.initialize.call(this, options);
            console.log('HeatmapGridLayer initialized, fieldMeta:', !!this.options.fieldMeta);
        },

        createTile: function(coords) {
            const tile = document.createElement('canvas');
            const tileSize = this.getTileSize();
            tile.width = tileSize.x;
            tile.height = tileSize.y;

            const ctx = tile.getContext('2d');
            const imageData = ctx.createImageData(tileSize.x, tileSize.y);
            const data = imageData.data;

            const meta = this.options.fieldMeta;
            if (!meta || !meta.field) {
                console.error('No fieldMeta in tile options:', meta);
                return tile;
            }

            // Get tile bounds in lat/lng
            const nwPoint = coords.scaleBy(tileSize);
            const zoom = coords.z;
            const nw = this._map.unproject(nwPoint, zoom);
            const se = this._map.unproject(nwPoint.add(tileSize), zoom);

            const latStep = (nw.lat - se.lat) / tileSize.y;
            const lngStep = (se.lng - nw.lng) / tileSize.x;

            // Render every pixel - bilinear interpolation makes this smooth
            // and pre-computed field makes this fast
            let coloredPixels = 0;
            let minDist = Infinity, maxDist = 0;

            for (let y = 0; y < tileSize.y; y++) {
                const lat = nw.lat - y * latStep;

                for (let x = 0; x < tileSize.x; x++) {
                    const lng = nw.lng + x * lngStep;

                    const dist = sampleDistanceField(lat, lng, meta);
                    const color = distanceToColor(dist);

                    if (dist < minDist) minDist = dist;
                    if (dist < 10000 && dist > maxDist) maxDist = dist;

                    const idx = (y * tileSize.x + x) * 4;
                    data[idx] = color[0];
                    data[idx + 1] = color[1];
                    data[idx + 2] = color[2];
                    data[idx + 3] = color[3];

                    if (color[3] > 0) coloredPixels++;
                }
            }

            // Debug first few tiles
            if (!this._debuggedTiles) this._debuggedTiles = 0;
            if (this._debuggedTiles < 3) {
                console.log(`Tile ${coords.x},${coords.y},${coords.z}: colored=${coloredPixels}, dist range=${minDist.toFixed(0)}-${maxDist.toFixed(0)}km`);
                this._debuggedTiles++;
            }

            ctx.putImageData(imageData, 0, 0);
            return tile;
        }
    });

    return HeatmapGridLayer;
}

/**
 * Generate heatmap V2 - Canvas-based with smooth gradient
 * Green (<50km) -> Yellow (~224km) -> Red (>1000km)
 * Logarithmic scale, pre-computed distance field
 */
async function generateHeatmapV2() {
    if (pointsA.length === 0 || pointsB.length === 0) {
        alert('Please load both point lists first');
        return;
    }

    console.time('Heatmap V2 Generation');
    console.log('Starting Heatmap V2 generation...');

    // Remove existing heatmap layers and hide other markers
    if (heatmapV2Layer) {
        map.removeLayer(heatmapV2Layer);
        heatmapV2Layer = null;
    }
    if (midpointClusterGroup) map.removeLayer(midpointClusterGroup);
    if (map.hasLayer(heatmapLayer)) map.removeLayer(heatmapLayer);
    if (map.hasLayer(rawMidpointLayer)) map.removeLayer(rawMidpointLayer);

    // Hide point layers for cleaner view
    if (map.hasLayer(layers.pointsA)) map.removeLayer(layers.pointsA);
    if (map.hasLayer(layers.pointsB)) map.removeLayer(layers.pointsB);
    if (map.hasLayer(layers.highlight)) map.removeLayer(layers.highlight);
    if (map.hasLayer(layers.target)) map.removeLayer(layers.target);

    // STEP 1: Calculate all midpoints if not cached
    if (allMidpoints.length === 0) {
        const totalCombos = pointsA.length * pointsB.length;
        const useWorker = totalCombos >= 10000;

        if (useWorker) {
            showProgress(true, 'Calculating midpoints...', 0);
            try {
                const result = await GeoWorkerAPI.calculateAllMidpoints(
                    pointsA,
                    pointsB,
                    {
                        onProgress: (percent) => {
                            showProgress(true, 'Calculating midpoints...', percent);
                        }
                    }
                );
                allMidpoints = result.midpoints;
                console.log(`✓ Worker calculated ${allMidpoints.length} midpoints in ${(result.elapsed / 1000).toFixed(2)}s`);
            } finally {
                showProgress(false);
            }
        } else {
            console.log('Calculating midpoints (sync)...');
            pointsA.forEach((pointA) => {
                pointsB.forEach((pointB) => {
                    const aTurf = turf.point([pointA.lng, pointA.lat]);
                    const bTurf = turf.point([pointB.lng, pointB.lat]);
                    const midpointTurf = turf.midpoint(aTurf, bTurf);
                    allMidpoints.push({
                        lat: midpointTurf.geometry.coordinates[1],
                        lng: midpointTurf.geometry.coordinates[0]
                    });
                });
            });
            console.log(`✓ Calculated ${allMidpoints.length} midpoints`);
        }
    }

    // STEP 2: Build distance field (or use cached)
    if (!distanceField || !distanceFieldMeta) {
        console.log('Building distance field...');
        showProgress(true, 'Building distance field...', 0);

        distanceFieldMeta = await buildDistanceField(allMidpoints, 0.2, (percent) => {
            showProgress(true, 'Building distance field...', percent);
        });
        distanceField = distanceFieldMeta.field;
        console.log(`✓ Distance field built: ${distanceFieldMeta.latCells}x${distanceFieldMeta.lngCells}`);
    }

    // STEP 3: Create and add the canvas layer
    console.log('Creating heatmap layer...');
    showProgress(true, 'Rendering heatmap...', 100);

    const HeatmapLayer = createHeatmapGridLayer(distanceFieldMeta);
    heatmapV2Layer = new HeatmapLayer({
        fieldMeta: distanceFieldMeta,
        tileSize: 256,
        opacity: 1,
        updateWhenZooming: false,
        updateWhenIdle: true,
        keepBuffer: 4
    });

    heatmapV2Layer.addTo(map);
    console.log('✓ Heatmap layer added to map');

    showProgress(false);
    console.timeEnd('Heatmap V2 Generation');

    alert(`Heatmap V2 generated!\n\n${allMidpoints.length} midpoints\nDistance field: ${distanceFieldMeta.latCells}x${distanceFieldMeta.lngCells}\n\nGreen: <50km\nYellow: ~224km\nRed: >1000km`);
}

/**
 * Update file display UI
 */
function updateFileDisplay(list, filename, count) {
    const nameEl = document.getElementById(`file-${list}-name`);
    const statusEl = document.getElementById(`file-${list}-status`);

    if (filename && count > 0) {
        nameEl.textContent = filename;
        statusEl.textContent = `${count} points loaded`;
    } else if (filename) {
        nameEl.textContent = filename;
        statusEl.textContent = 'No valid points';
    } else {
        nameEl.textContent = 'No file loaded';
        statusEl.textContent = `Click to upload List ${list.toUpperCase()}`;
    }
}

/**
 * Handle file upload for List A
 */
function handleFileAUpload(event) {
    DataLoader.handleFileInput(event, 'finder_list_a', (points, filename) => {
        pointsA = points;
        allMidpoints = []; // Clear cache when data changes
        distanceField = null; // Clear distance field cache
        distanceFieldMeta = null;
        combinations = [];
        updateFileDisplay('a', filename, points.length);
        document.getElementById('count-a').textContent = points.length;
        drawAllPoints();
    }, { defaultTitle: true });
}

/**
 * Handle file upload for List B
 */
function handleFileBUpload(event) {
    DataLoader.handleFileInput(event, 'finder_list_b', (points, filename) => {
        pointsB = points;
        allMidpoints = []; // Clear cache when data changes
        distanceField = null; // Clear distance field cache
        distanceFieldMeta = null;
        combinations = [];
        updateFileDisplay('b', filename, points.length);
        document.getElementById('count-b').textContent = points.length;
        drawAllPoints();
    }, { defaultTitle: true });
}

/**
 * Load points on startup from storage
 */
async function loadInitialPoints() {
    // Load List A from storage
    const resultA = await DataLoader.loadWithFallback('finder_list_a', null, { defaultTitle: true });
    pointsA = resultA.points;
    updateFileDisplay('a', resultA.filename, pointsA.length);
    document.getElementById('count-a').textContent = pointsA.length;

    // Load List B from storage
    const resultB = await DataLoader.loadWithFallback('finder_list_b', null, { defaultTitle: true });
    pointsB = resultB.points;
    updateFileDisplay('b', resultB.filename, pointsB.length);
    document.getElementById('count-b').textContent = pointsB.length;

    // Draw all points on the map
    drawAllPoints();
}

/**
 * Load target coordinates from URL hash if present
 * Format: #lat,lng (e.g., #15.84394,37.03076)
 */
function loadFromUrlHash() {
    const hash = window.location.hash.substring(1); // Remove the '#'

    if (!hash) {
        return false;
    }

    const coords = parseCoordinates(hash);

    if (coords) {
        // Set the input field
        document.getElementById('target-coords').value = hash;

        // Trigger find
        setTimeout(() => {
            findCombinations();
        }, 500); // Small delay to ensure points are loaded

        return true;
    }

    return false;
}

/**
 * Initialize application
 */
async function init() {
    // Render navigation
    NavUtils.render('site-nav', 'finder');

    initMap();

    // Load both point lists on startup
    await loadInitialPoints();

    // File upload handlers
    document.getElementById('file-a-btn').addEventListener('click', () => {
        document.getElementById('file-a').click();
    });
    document.getElementById('file-a').addEventListener('change', handleFileAUpload);

    document.getElementById('file-b-btn').addEventListener('click', () => {
        document.getElementById('file-b').click();
    });
    document.getElementById('file-b').addEventListener('change', handleFileBUpload);

    document.getElementById('find-btn').addEventListener('click', findCombinations);

    document.getElementById('target-coords').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            findCombinations();
        }
    });

    // Show clustered midpoints button
    document.getElementById('show-all-midpoints-btn').addEventListener('click', showAllMidpoints);

    // Show raw midpoints button
    document.getElementById('show-raw-midpoints-btn').addEventListener('click', showRawMidpoints);

    // Show heatmap button
    document.getElementById('show-heatmap-btn').addEventListener('click', generateHeatmap);

    // Show heatmap V2 button
    document.getElementById('show-heatmap-v2-btn').addEventListener('click', generateHeatmapV2);

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

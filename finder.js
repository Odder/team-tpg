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
let pointLayersA = L.layerGroup();
let pointLayersB = L.layerGroup();
let targetLayer = L.layerGroup();
let highlightLayer = L.layerGroup();
let midpointClusterGroup = null;
let rawMidpointLayer = L.layerGroup();
let heatmapLayer = L.layerGroup();
let allMidpoints = []; // Cache for all calculated midpoints

/**
 * Initialize the map
 */
function initMap() {
    map = L.map('map', {
        center: [20, 0],
        zoom: 3,
        minZoom: 2,
        maxZoom: 18
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    pointLayersA.addTo(map);
    pointLayersB.addTo(map);
    targetLayer.addTo(map);
    highlightLayer.addTo(map);
    // heatmapLayer added on-demand
}

/**
 * Load points from a CSV file
 */
async function loadPoints(filename) {
    try {
        const response = await fetch(filename);
        const text = await response.text();

        const points = text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map((line, index) => {
                const titleMatch = line.match(/"([^"]+)"/);
                const title = titleMatch ? titleMatch[1] : null;
                const dataLine = title ? line.replace(/"[^"]+"/, '').trim() : line;
                const parts = dataLine.split(',').map(s => s.trim()).filter(s => s);
                const [lat, lng, radiusKm] = parts.map(parseFloat);

                if (isNaN(lng) || isNaN(lat) || isNaN(radiusKm)) {
                    return null;
                }

                return {
                    lat: lat,
                    lng: lng,
                    radius: radiusKm * 1000,
                    title: title || `Point ${index + 1}`
                };
            })
            .filter(point => point !== null);

        return points;
    } catch (error) {
        console.error(`Error loading ${filename}:`, error);
        return [];
    }
}

/**
 * Parse coordinate input
 */
function parseCoordinates(input) {
    const parts = input.trim().split(',').map(p => p.trim());
    if (parts.length !== 2) return null;

    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return null;
    }

    return { lat, lng };
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
 * Find and rank all combinations
 */
function findBestCombinations(target) {
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
    highlightLayer.clearLayers();

    // Draw point A (blue)
    const circleA = L.circle([combo.pointA.lat, combo.pointA.lng], {
        radius: combo.pointA.radius,
        color: '#3498db',
        fillColor: '#3498db',
        fillOpacity: 0.4,
        weight: 4
    });
    circleA.bindPopup(`<strong>Point A: ${combo.pointA.title}</strong><br>Radius: ${(combo.pointA.radius / 1000).toFixed(0)} km`);
    circleA.addTo(highlightLayer);

    // Draw point B (purple)
    const circleB = L.circle([combo.pointB.lat, combo.pointB.lng], {
        radius: combo.pointB.radius,
        color: '#9b59b6',
        fillColor: '#9b59b6',
        fillOpacity: 0.4,
        weight: 4
    });
    circleB.bindPopup(`<strong>Point B: ${combo.pointB.title}</strong><br>Radius: ${(combo.pointB.radius / 1000).toFixed(0)} km`);
    circleB.addTo(highlightLayer);

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
        <a href="${googleMapsUrl}" target="_blank" style="color: #3498db;">📍 Open in Google Maps</a>
    `);
    midpointMarker.addTo(highlightLayer);

    // Draw line A to B
    const aTurf = turf.point([combo.pointA.lng, combo.pointA.lat]);
    const bTurf = turf.point([combo.pointB.lng, combo.pointB.lat]);
    const greatCircle = turf.greatCircle(aTurf, bTurf);

    L.geoJSON(greatCircle, {
        style: {
            color: '#95a5a6',
            weight: 2,
            opacity: 0.5,
            dashArray: '5, 5'
        }
    }).addTo(highlightLayer);
}

/**
 * Draw all points on the map
 */
function drawAllPoints() {
    pointLayersA.clearLayers();
    pointLayersB.clearLayers();

    // Draw A points (blue)
    pointsA.forEach((point, index) => {
        const circle = L.circle([point.lat, point.lng], {
            radius: point.radius,
            color: '#3498db',
            fillColor: '#3498db',
            fillOpacity: 0.1,
            weight: 1
        });
        circle.bindPopup(`<strong>A${index + 1}: ${point.title}</strong>`);
        circle.addTo(pointLayersA);
    });

    // Draw B points (purple)
    pointsB.forEach((point, index) => {
        const circle = L.circle([point.lat, point.lng], {
            radius: point.radius,
            color: '#9b59b6',
            fillColor: '#9b59b6',
            fillOpacity: 0.1,
            weight: 1
        });
        circle.bindPopup(`<strong>B${index + 1}: ${point.title}</strong>`);
        circle.addTo(pointLayersB);
    });
}

/**
 * Draw target point
 */
function drawTarget(target) {
    targetLayer.clearLayers();

    const marker = L.circleMarker([target.lat, target.lng], {
        radius: 8,
        color: '#e74c3c',
        fillColor: '#e74c3c',
        fillOpacity: 0.9,
        weight: 3
    });

    marker.bindPopup(`<strong>Target</strong><br>Lat: ${target.lat.toFixed(4)}<br>Lng: ${target.lng.toFixed(4)}`);
    marker.addTo(targetLayer);
}

/**
 * Main find function
 */
async function findCombinations() {
    const fileA = document.getElementById('file-a').value;
    const fileB = document.getElementById('file-b').value;
    const targetInput = document.getElementById('target-coords').value;

    const target = parseCoordinates(targetInput);
    if (!target) {
        alert('Invalid target coordinates');
        return;
    }

    // Load both files
    pointsA = await loadPoints(fileA);
    pointsB = await loadPoints(fileB);

    document.getElementById('count-a').textContent = pointsA.length;
    document.getElementById('count-b').textContent = pointsB.length;

    if (pointsA.length === 0 || pointsB.length === 0) {
        alert('Failed to load points from one or both files');
        return;
    }

    // Draw all points
    drawAllPoints();
    drawTarget(target);

    // Find best combinations
    findBestCombinations(target);
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
function generateHeatmap() {
    if (pointsA.length === 0 || pointsB.length === 0) {
        alert('Please load both point lists first');
        return;
    }

    console.time('Heatmap Generation');

    // Hide other layers for performance
    if (midpointClusterGroup) map.removeLayer(midpointClusterGroup);
    map.removeLayer(pointLayersA);
    map.removeLayer(pointLayersB);
    map.removeLayer(highlightLayer);

    // Clear existing heatmap
    heatmapLayer.clearLayers();
    map.addLayer(heatmapLayer);

    // STEP 1: Calculate all midpoints if not already cached
    if (allMidpoints.length === 0) {
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

/**
 * Load points on startup
 */
async function loadInitialPoints() {
    const fileA = document.getElementById('file-a').value;
    const fileB = document.getElementById('file-b').value;

    pointsA = await loadPoints(fileA);
    pointsB = await loadPoints(fileB);

    document.getElementById('count-a').textContent = pointsA.length;
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
    initMap();

    // Load both point lists on startup
    await loadInitialPoints();

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

    // Load from URL hash if present
    loadFromUrlHash();
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

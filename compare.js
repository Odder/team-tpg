/**
 * Team Comparison - Compare multiple teams and visualize winning regions
 */

// Team color palette (10 distinct colors)
const TEAM_COLORS = [
    '#e74c3c', // Red
    '#3498db', // Blue
    '#2ecc71', // Green
    '#9b59b6', // Purple
    '#f39c12', // Orange
    '#1abc9c', // Teal
    '#e91e63', // Pink
    '#00bcd4', // Cyan
    '#ff5722', // Deep Orange
    '#795548'  // Brown
];

// Data storage
let teams = [];
let nextTeamId = 1;

// Map and layers
let map = null;
let layers = {};
let voronoiLayer = null;

// Spatial index for fast nearest-neighbor lookups
let midpointIndex = null;

/**
 * Initialize the map
 */
function initMap() {
    map = MapUtils.createMap('map');
    layers = MapUtils.createLayers(map, ['teams', 'highlight']);
    // Note: We use our own context menu, don't add MapUtils one
}

/**
 * Get next available team color
 */
function getNextColor() {
    const usedColors = teams.map(t => t.color);
    for (const color of TEAM_COLORS) {
        if (!usedColors.includes(color)) {
            return color;
        }
    }
    // If all colors used, cycle back with slight variation
    return TEAM_COLORS[teams.length % TEAM_COLORS.length];
}

/**
 * Add a new team
 */
function addTeam() {
    const team = {
        id: nextTeamId++,
        name: `Team ${teams.length + 1}`,
        color: getNextColor(),
        csvA: { content: '', filename: '', points: [] },
        csvB: { content: '', filename: '', points: [] },
        midpoints: [],
        midpointsCacheKey: null
    };

    teams.push(team);
    renderTeams();
    updateStats();
    saveTeamsToStorage();
}

/**
 * Remove a team
 */
function removeTeam(teamId) {
    teams = teams.filter(t => t.id !== teamId);
    renderTeams();
    updateStats();
    saveTeamsToStorage();

    // Clear voronoi if no teams left
    if (teams.length === 0 && voronoiLayer) {
        map.removeLayer(voronoiLayer);
        voronoiLayer = null;
    }
}

/**
 * Render all teams in the UI
 */
function renderTeams() {
    const container = document.getElementById('teams-container');

    // Clear container
    container.innerHTML = '';

    // Show empty state if no teams
    if (teams.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No teams added yet.<br>Add teams to compare their coverage.</p>
            </div>
        `;
        return;
    }

    teams.forEach(team => {
        const card = document.createElement('div');
        card.className = 'team-card';
        card.style.borderLeftColor = team.color;

        card.innerHTML = `
            <div class="team-header">
                <div class="team-color-dot" style="background: ${team.color}"></div>
                <div class="team-name">${team.name}</div>
                <button class="team-remove-btn" data-team-id="${team.id}" title="Remove team">&times;</button>
            </div>
            <div class="team-files">
                <div class="team-file-box">
                    <span class="file-label">A</span>
                    <div class="file-info">
                        <div class="file-name">${team.csvA.filename || 'No file'}</div>
                        <div class="file-status">${team.csvA.points.length} points</div>
                    </div>
                    <button class="upload-btn" data-team-id="${team.id}" data-slot="A">Upload</button>
                    <input type="file" id="file-${team.id}-a" accept=".csv,.txt" data-team-id="${team.id}" data-slot="A">
                </div>
                <div class="team-file-box">
                    <span class="file-label">B</span>
                    <div class="file-info">
                        <div class="file-name">${team.csvB.filename || 'No file'}</div>
                        <div class="file-status">${team.csvB.points.length} points</div>
                    </div>
                    <button class="upload-btn" data-team-id="${team.id}" data-slot="B">Upload</button>
                    <input type="file" id="file-${team.id}-b" accept=".csv,.txt" data-team-id="${team.id}" data-slot="B">
                </div>
            </div>
            <div class="team-stats">
                Combinations: ${team.csvA.points.length * team.csvB.points.length}
            </div>
        `;

        container.appendChild(card);

        // Wire up event handlers
        card.querySelector('.team-remove-btn').addEventListener('click', (e) => {
            removeTeam(parseInt(e.target.dataset.teamId));
        });

        card.querySelectorAll('.upload-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const teamId = parseInt(e.target.dataset.teamId);
                const slot = e.target.dataset.slot;
                document.getElementById(`file-${teamId}-${slot.toLowerCase()}`).click();
            });
        });

        card.querySelectorAll('input[type="file"]').forEach(input => {
            input.addEventListener('change', (e) => {
                const teamId = parseInt(e.target.dataset.teamId);
                const slot = e.target.dataset.slot;
                handleFileUpload(e, teamId, slot);
            });
        });
    });
}

/**
 * Handle file upload for a team
 */
function handleFileUpload(event, teamId, slot) {
    const file = event.target.files[0];
    if (!file) return;

    const team = teams.find(t => t.id === teamId);
    if (!team) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        const points = DataLoader.parseCSV(content, { defaultTitle: true });

        if (slot === 'A') {
            team.csvA = { content, filename: file.name, points };
        } else {
            team.csvB = { content, filename: file.name, points };
        }

        // Clear cached midpoints when data changes
        team.midpoints = [];
        team.midpointsCacheKey = null;

        renderTeams();
        updateStats();
        saveTeamsToStorage();
    };
    reader.readAsText(file);
}

/**
 * Calculate midpoints for a team (with caching)
 */
function calculateTeamMidpoints(team) {
    if (team.csvA.points.length === 0 || team.csvB.points.length === 0) {
        team.midpoints = [];
        return;
    }

    // Check cache
    if (team.csvA.content && team.csvB.content) {
        const cacheKey = MidpointCache.getCacheKey(team.csvA.content, team.csvB.content);

        const cached = MidpointCache.get(cacheKey);
        if (cached) {
            team.midpoints = cached;
            team.midpointsCacheKey = cacheKey;
            return;
        }

        // Calculate midpoints
        const midpoints = [];
        team.csvA.points.forEach(pointA => {
            team.csvB.points.forEach(pointB => {
                const aTurf = turf.point([pointA.lng, pointA.lat]);
                const bTurf = turf.point([pointB.lng, pointB.lat]);
                const midpointTurf = turf.midpoint(aTurf, bTurf);

                midpoints.push({
                    lat: midpointTurf.geometry.coordinates[1],
                    lng: midpointTurf.geometry.coordinates[0]
                });
            });
        });

        team.midpoints = midpoints;
        team.midpointsCacheKey = cacheKey;

        // Store in cache
        MidpointCache.set(cacheKey, midpoints);
    }
}

/**
 * Web Mercator projection functions
 */
const Projection = {
    // Convert lat/lng to Web Mercator (EPSG:3857)
    toMercator(lat, lng) {
        const x = lng * 20037508.34 / 180;
        let y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
        y = y * 20037508.34 / 180;
        return { x, y };
    },

    // Convert Web Mercator to lat/lng
    fromMercator(x, y) {
        const lng = x * 180 / 20037508.34;
        let lat = y * 180 / 20037508.34;
        lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
        return { lat, lng };
    }
};

/**
 * Show progress indicator
 */
function showProgress(show, message = 'Processing...', percent = null) {
    let progressEl = document.getElementById('calc-progress');

    if (!progressEl && show) {
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
                ${percent !== null ? `
                <div style="width: 100%; height: 8px; background: var(--accent); border-radius: 4px; overflow: hidden;">
                    <div style="width: ${percent}%; height: 100%; background: var(--green); transition: width 0.2s;"></div>
                </div>
                ` : ''}
            `;
            progressEl.style.display = 'block';
        } else {
            progressEl.style.display = 'none';
        }
    }
}

/**
 * Generate Voronoi comparison map
 */
async function generateVoronoiMap() {
    // Validate teams
    const validTeams = teams.filter(t =>
        t.csvA.points.length > 0 && t.csvB.points.length > 0
    );

    if (validTeams.length < 2) {
        alert('Please add at least 2 teams with both CSV files loaded');
        return;
    }

    // Calculate midpoints for all teams
    const totalCombos = validTeams.reduce((sum, t) =>
        sum + t.csvA.points.length * t.csvB.points.length, 0
    );

    showProgress(true, `Calculating ${totalCombos.toLocaleString()} midpoints...`, 0);

    let processedCombos = 0;

    for (const team of validTeams) {
        showProgress(true, `Calculating midpoints for ${team.name}...`, Math.round(processedCombos / totalCombos * 50));
        calculateTeamMidpoints(team);
        processedCombos += team.csvA.points.length * team.csvB.points.length;
    }

    showProgress(true, 'Pooling midpoints...', 50);

    // Pool all midpoints with team info
    const allPoints = [];
    validTeams.forEach(team => {
        team.midpoints.forEach(mp => {
            allPoints.push({
                lat: mp.lat,
                lng: mp.lng,
                teamId: team.id,
                color: team.color
            });
        });
    });

    if (allPoints.length === 0) {
        showProgress(false);
        alert('No midpoints calculated. Check your CSV files.');
        return;
    }

    console.log(`Total midpoints for Voronoi: ${allPoints.length}`);

    // Build spatial index for fast nearest-neighbor lookups
    showProgress(true, `Building spatial index (${allPoints.length.toLocaleString()} points)...`, 55);
    midpointIndex = SpatialIndex.create(allPoints);
    console.log(`Spatial index built with ${midpointIndex.size} points`);

    // Use all points for Voronoi calculation
    const pointsToUse = allPoints;

    showProgress(true, `Projecting ${pointsToUse.length.toLocaleString()} coordinates...`, 60);

    // Project to Web Mercator for Voronoi calculation
    const projectedPoints = pointsToUse.map(p => {
        const { x, y } = Projection.toMercator(p.lat, p.lng);
        return { ...p, x, y };
    });

    // Get bounds for Voronoi (loop to avoid stack overflow with large arrays)
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const p of projectedPoints) {
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
        if (p.y < yMin) yMin = p.y;
        if (p.y > yMax) yMax = p.y;
    }
    xMin -= 1000000;
    xMax += 1000000;
    yMin -= 1000000;
    yMax += 1000000;

    showProgress(true, `Computing ${pointsToUse.length.toLocaleString()} Voronoi cells...`, 70);

    // Build Delaunay triangulation and Voronoi diagram
    const delaunay = d3.Delaunay.from(
        projectedPoints,
        p => p.x,
        p => p.y
    );
    const voronoi = delaunay.voronoi([xMin, yMin, xMax, yMax]);

    showProgress(true, 'Extracting team boundaries...', 75);

    // Remove existing voronoi layer
    if (voronoiLayer) {
        map.removeLayer(voronoiLayer);
    }

    voronoiLayer = L.layerGroup();

    // Create canonical edge key (sorted endpoints for consistency)
    const makeEdgeKey = (p1, p2) => {
        // Round to avoid floating point issues
        const x1 = Math.round(p1[0] * 1000) / 1000;
        const y1 = Math.round(p1[1] * 1000) / 1000;
        const x2 = Math.round(p2[0] * 1000) / 1000;
        const y2 = Math.round(p2[1] * 1000) / 1000;

        // Sort so edge (A,B) and (B,A) have same key
        if (x1 < x2 || (x1 === x2 && y1 < y2)) {
            return `${x1},${y1}|${x2},${y2}`;
        }
        return `${x2},${y2}|${x1},${y1}`;
    };

    // Parse edge key back to points
    const parseEdgeKey = (key) => {
        const [p1, p2] = key.split('|');
        const [x1, y1] = p1.split(',').map(Number);
        const [x2, y2] = p2.split(',').map(Number);
        return [[x1, y1], [x2, y2]];
    };

    // Collect edges per team with counts
    // An edge appearing once = boundary edge
    // An edge appearing twice = internal edge (shared between same-team cells)
    const teamEdges = new Map(); // teamId -> Map<edgeKey, count>

    validTeams.forEach(team => {
        teamEdges.set(team.id, new Map());
    });

    const totalCells = projectedPoints.length;
    const cellProgressInterval = Math.floor(totalCells / 10) || 1;

    for (let i = 0; i < totalCells; i++) {
        // Update progress every 10%
        if (i % cellProgressInterval === 0) {
            const percent = 75 + Math.floor((i / totalCells) * 10);
            showProgress(true, `Extracting edges (${i.toLocaleString()}/${totalCells.toLocaleString()})...`, percent);
        }

        const cell = voronoi.cellPolygon(i);
        if (!cell) continue;

        const teamId = projectedPoints[i].teamId;
        const edges = teamEdges.get(teamId);

        // Add each edge of this cell
        for (let j = 0; j < cell.length - 1; j++) {
            const key = makeEdgeKey(cell[j], cell[j + 1]);
            edges.set(key, (edges.get(key) || 0) + 1);
        }
    }

    showProgress(true, 'Tracing boundaries...', 86);

    // Calculate signed area of polygon (positive = CCW, negative = CW)
    const signedArea = (polygon) => {
        let area = 0;
        for (let i = 0; i < polygon.length - 1; i++) {
            const [x1, y1] = polygon[i];
            const [x2, y2] = polygon[i + 1];
            area += (x2 - x1) * (y2 + y1);
        }
        return area / 2;
    };

    // Check if point is inside polygon (ray casting)
    const pointInPolygon = (point, polygon) => {
        const [x, y] = point;
        let inside = false;
        for (let i = 0, j = polygon.length - 2; i < polygon.length - 1; j = i++) {
            const [xi, yi] = polygon[i];
            const [xj, yj] = polygon[j];
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    };

    // Trace boundary edges into closed polygons
    const tracePolygons = (boundaryEdges) => {
        if (boundaryEdges.length === 0) return [];

        // Build adjacency: vertex -> list of connected vertices
        const adjacency = new Map();
        const addEdge = (p1, p2) => {
            const k1 = `${p1[0]},${p1[1]}`;
            const k2 = `${p2[0]},${p2[1]}`;
            if (!adjacency.has(k1)) adjacency.set(k1, []);
            if (!adjacency.has(k2)) adjacency.set(k2, []);
            adjacency.get(k1).push({ key: k2, point: p2 });
            adjacency.get(k2).push({ key: k1, point: p1 });
        };

        boundaryEdges.forEach(([p1, p2]) => addEdge(p1, p2));

        const polygons = [];

        // Trace closed loops
        for (const [startKey, neighbors] of adjacency) {
            if (neighbors.length === 0) continue;

            while (adjacency.get(startKey).length > 0) {
                const polygon = [];
                let currentKey = startKey;
                let current = startKey.split(',').map(Number);
                polygon.push(current);

                let safety = 0;
                const maxIterations = boundaryEdges.length * 2;

                while (safety++ < maxIterations) {
                    const currentNeighbors = adjacency.get(currentKey);
                    if (!currentNeighbors || currentNeighbors.length === 0) break;

                    // Take first available neighbor
                    const next = currentNeighbors.shift();
                    const nextKey = next.key;

                    // Remove reverse edge
                    const reverseNeighbors = adjacency.get(nextKey);
                    if (reverseNeighbors) {
                        const idx = reverseNeighbors.findIndex(n => n.key === currentKey);
                        if (idx !== -1) reverseNeighbors.splice(idx, 1);
                    }

                    // Check if we've closed the loop
                    if (nextKey === startKey) {
                        if (polygon.length >= 3) {
                            polygon.push(polygon[0]); // Close it
                            polygons.push(polygon);
                        }
                        break;
                    }

                    polygon.push(next.point);
                    currentKey = nextKey;
                    current = next.point;
                }
            }
        }

        return polygons;
    };

    // Organize polygons into outer shells with holes
    const organizePolygonsWithHoles = (polygons) => {
        if (polygons.length === 0) return [];

        // Calculate area for each polygon
        const analyzed = polygons.map((poly, idx) => ({
            polygon: poly,
            index: idx,
            absArea: Math.abs(signedArea(poly))
        }));

        // Sort by absolute area descending (largest first)
        analyzed.sort((a, b) => b.absArea - a.absArea);

        // For each polygon, find its immediate parent (smallest polygon that contains it)
        const parent = new Array(analyzed.length).fill(-1);

        for (let i = 0; i < analyzed.length; i++) {
            const candidate = analyzed[i];
            // Check larger polygons (earlier in sorted list) to find parent
            for (let j = i - 1; j >= 0; j--) {
                if (pointInPolygon(candidate.polygon[0], analyzed[j].polygon)) {
                    // Found a containing polygon - is it the immediate parent?
                    // It's the immediate parent if no polygon between j and i also contains candidate
                    let isImmediate = true;
                    for (let k = j + 1; k < i; k++) {
                        if (parent[k] === j || parent[k] === -1) {
                            // k is either a sibling or a top-level, check if it contains candidate
                            if (pointInPolygon(candidate.polygon[0], analyzed[k].polygon)) {
                                isImmediate = false;
                                break;
                            }
                        }
                    }
                    if (isImmediate) {
                        parent[i] = j;
                        break;
                    }
                }
            }
        }

        // Determine nesting depth for each polygon
        const depth = new Array(analyzed.length).fill(0);
        for (let i = 0; i < analyzed.length; i++) {
            let d = 0;
            let p = parent[i];
            while (p !== -1) {
                d++;
                p = parent[p];
            }
            depth[i] = d;
        }

        // Even depth = outer polygon, odd depth = hole
        // Group: depth 0 polygons are outers, their depth 1 children are holes
        // depth 2 children are outers again (islands within holes), etc.

        const result = [];
        const indexToResult = new Map(); // maps analyzed index to result index

        // First, create entries for all outer polygons (even depth)
        for (let i = 0; i < analyzed.length; i++) {
            if (depth[i] % 2 === 0) {
                indexToResult.set(i, result.length);
                result.push({ outer: analyzed[i].polygon, holes: [] });
            }
        }

        // Then, assign holes (odd depth) to their parent outer
        for (let i = 0; i < analyzed.length; i++) {
            if (depth[i] % 2 === 1) {
                const parentIdx = parent[i];
                if (parentIdx !== -1 && indexToResult.has(parentIdx)) {
                    const resultIdx = indexToResult.get(parentIdx);
                    // Ensure hole has opposite winding
                    const holeArea = signedArea(analyzed[i].polygon);
                    const outerArea = signedArea(result[resultIdx].outer);
                    if ((holeArea > 0) === (outerArea > 0)) {
                        analyzed[i].polygon.reverse();
                    }
                    result[resultIdx].holes.push(analyzed[i].polygon);
                }
            }
        }

        return result;
    };

    // Collect GeoJSON polygons for coverage calculation
    const teamGeoJsonMap = new Map();
    validTeams.forEach(team => teamGeoJsonMap.set(team.id, []));

    // Process each team
    for (let teamIdx = 0; teamIdx < validTeams.length; teamIdx++) {
        const team = validTeams[teamIdx];
        const percent = 86 + Math.floor((teamIdx / validTeams.length) * 4);
        showProgress(true, `Rendering ${team.name} polygons...`, percent);

        const edges = teamEdges.get(team.id);

        // Keep only boundary edges (count === 1)
        const boundaryEdges = [];
        for (const [key, count] of edges) {
            if (count === 1) {
                boundaryEdges.push(parseEdgeKey(key));
            }
        }

        if (boundaryEdges.length === 0) continue;

        // Trace edges into closed polygons
        const polygons = tracePolygons(boundaryEdges);

        // Organize into outer polygons with holes
        const organized = organizePolygonsWithHoles(polygons);

        // Convert to Leaflet and render
        organized.forEach(({ outer, holes }) => {
            // Convert outer ring from Mercator to lat/lng
            const outerLatLngs = outer.map(([x, y]) => {
                const { lat, lng } = Projection.fromMercator(x, y);
                const clampedLat = Math.max(-85, Math.min(85, lat));
                const clampedLng = Math.max(-180, Math.min(180, lng));
                return [clampedLat, clampedLng];
            });

            // Convert holes
            const holeLatLngs = holes.map(hole =>
                hole.map(([x, y]) => {
                    const { lat, lng } = Projection.fromMercator(x, y);
                    const clampedLat = Math.max(-85, Math.min(85, lat));
                    const clampedLng = Math.max(-180, Math.min(180, lng));
                    return [clampedLat, clampedLng];
                })
            );

            // Leaflet polygon with holes: [outer, hole1, hole2, ...]
            const allRings = [outerLatLngs, ...holeLatLngs];

            const leafletPoly = L.polygon(allRings, {
                fillColor: team.color,
                fillOpacity: 0.5,
                weight: 0,
                interactive: false
            });

            leafletPoly.addTo(voronoiLayer);

            // Create GeoJSON for coverage calculation (Turf uses [lng, lat] order)
            try {
                const outerRing = outerLatLngs.map(([lat, lng]) => [lng, lat]);
                // Ensure ring is closed
                if (outerRing.length > 0 && (outerRing[0][0] !== outerRing[outerRing.length-1][0] || outerRing[0][1] !== outerRing[outerRing.length-1][1])) {
                    outerRing.push(outerRing[0]);
                }

                const holeRings = holeLatLngs.map(hole => {
                    const ring = hole.map(([lat, lng]) => [lng, lat]);
                    if (ring.length > 0 && (ring[0][0] !== ring[ring.length-1][0] || ring[0][1] !== ring[ring.length-1][1])) {
                        ring.push(ring[0]);
                    }
                    return ring;
                });

                const geoJsonPoly = turf.polygon([outerRing, ...holeRings]);
                teamGeoJsonMap.get(team.id).push(geoJsonPoly);
            } catch (e) {
                // Skip invalid polygons for coverage calculation
            }
        });

        console.log(`${team.name}: ${boundaryEdges.length} boundary edges -> ${polygons.length} rings -> ${organized.length} polygons with holes`);
    }

    voronoiLayer.addTo(map);

    // Fit map to show all points
    const bounds = L.latLngBounds(pointsToUse.map(p => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [50, 50] });

    showProgress(false);

    updateStats();
    updateLegend();

    // Calculate and display coverage statistics using sampling
    calculateCoverageBySampling(validTeams);

    console.log(`Rendered ${validTeams.length} team regions`);
}

// Cached land polygon for point-in-land checks
let landFeatures = null;

/**
 * Load simplified land polygon for coverage calculations
 */
async function loadLandPolygon() {
    if (landFeatures) return landFeatures;

    try {
        // Use a simplified world land GeoJSON from Natural Earth (110m resolution)
        const response = await fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson');
        if (response.ok) {
            const data = await response.json();
            landFeatures = data.features;
            console.log(`Loaded ${landFeatures.length} land features for coverage calculation`);
            return landFeatures;
        }
    } catch (e) {
        console.warn('Could not load land polygon:', e);
    }
    return null;
}

/**
 * Check if a point is on land
 */
function isPointOnLand(lat, lng, landFeats) {
    if (!landFeats) return false;
    const point = turf.point([lng, lat]);
    for (const feature of landFeats) {
        try {
            if (turf.booleanPointInPolygon(point, feature)) {
                return true;
            }
        } catch (e) {
            // Skip invalid features
        }
    }
    return false;
}

/**
 * Generate a random point uniformly distributed on a sphere
 */
function randomSpherePoint() {
    // For uniform distribution on sphere:
    // lng = uniform(-180, 180)
    // lat = arcsin(uniform(-1, 1)) * 180/PI
    const lng = Math.random() * 360 - 180;
    const lat = Math.asin(Math.random() * 2 - 1) * (180 / Math.PI);
    return { lat, lng };
}

/**
 * Find which team wins at a given point using the spatial index (O(log n))
 */
function findWinnerAtPoint(point, teamMap) {
    if (!midpointIndex) return null;

    const nearest = midpointIndex.findNearest(point.lat, point.lng);
    if (!nearest) return null;

    return teamMap.get(nearest.teamId) || null;
}

/**
 * Calculate coverage using sampling approach
 * @param {Array} validTeams - Array of valid team objects with midpoints calculated
 * @param {number} numSamples - Number of sample points (default 20000)
 */
async function calculateCoverageBySampling(validTeams, numSamples = 20000) {
    const coverageStats = document.getElementById('coverage-stats');
    const coverageList = document.getElementById('coverage-list');

    if (!coverageStats || !coverageList) return;

    // Build team lookup map
    const teamMap = new Map();
    for (const team of validTeams) {
        teamMap.set(team.id, team);
    }

    // Initialize counters for each team
    const teamStats = new Map();
    for (const team of validTeams) {
        teamStats.set(team.id, {
            team,
            totalWins: 0,
            landWins: 0
        });
    }

    // Show loading state
    coverageList.innerHTML = '<div style="font-size: 12px; color: var(--text-secondary);">Sampling coverage...</div>';
    coverageStats.style.display = 'block';

    showProgress(true, 'Loading land boundaries...', 90);

    // Load land data
    const landFeats = await loadLandPolygon();

    let totalLandSamples = 0;
    const progressInterval = Math.floor(numSamples / 20); // Update every 5%

    // Generate samples and count winners (using spatial index for O(log n) lookups)
    for (let i = 0; i < numSamples; i++) {
        // Update progress periodically
        if (i % progressInterval === 0) {
            const percent = 90 + Math.floor((i / numSamples) * 10);
            showProgress(true, `Sampling coverage (${i.toLocaleString()}/${numSamples.toLocaleString()})...`, percent);
            // Yield to UI thread
            await new Promise(r => setTimeout(r, 0));
        }

        const point = randomSpherePoint();
        const winner = findWinnerAtPoint(point, teamMap);

        if (winner) {
            const stats = teamStats.get(winner.id);
            stats.totalWins++;

            // Check if on land
            const onLand = isPointOnLand(point.lat, point.lng, landFeats);
            if (onLand) {
                totalLandSamples++;
                stats.landWins++;
            }
        }
    }

    showProgress(false);

    // Calculate percentages
    const results = [];
    for (const [teamId, stats] of teamStats) {
        const totalPercent = (stats.totalWins / numSamples) * 100;
        const landPercent = totalLandSamples > 0 ? (stats.landWins / totalLandSamples) * 100 : 0;

        results.push({
            team: stats.team,
            totalWins: stats.totalWins,
            landWins: stats.landWins,
            totalPercent,
            landPercent
        });
    }

    // Sort by total coverage descending
    results.sort((a, b) => b.totalPercent - a.totalPercent);

    // Render results
    coverageList.innerHTML = results.map(r => `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; padding: 6px; background: var(--primary-bg); border-radius: 4px;">
            <div style="width: 12px; height: 12px; border-radius: 50%; background: ${r.team.color}; flex-shrink: 0;"></div>
            <div style="flex: 1; min-width: 0;">
                <div style="font-size: 12px; font-weight: 500; color: var(--text-primary);">${r.team.name}</div>
                <div style="font-size: 11px; color: var(--text-secondary);">
                    Global: ${r.totalPercent.toFixed(1)}%
                    ${landFeats ? ` · Land: ${r.landPercent.toFixed(1)}%` : ''}
                </div>
            </div>
        </div>
    `).join('') + `
        <div style="font-size: 10px; color: var(--text-secondary); margin-top: 8px; text-align: center;">
            Based on ${numSamples.toLocaleString()} samples${landFeats ? ` (${totalLandSamples.toLocaleString()} on land)` : ''}
        </div>
    `;

    console.log(`Coverage calculated from ${numSamples} samples (${totalLandSamples} on land)`);
}

/**
 * Update statistics display
 */
function updateStats() {
    document.getElementById('count-teams').textContent = teams.length;

    const totalMidpoints = teams.reduce((sum, t) => sum + t.midpoints.length, 0);
    document.getElementById('count-midpoints').textContent = totalMidpoints.toLocaleString();
}

/**
 * Update legend with team colors
 */
function updateLegend() {
    const legend = document.getElementById('legend');

    if (teams.length === 0) {
        legend.innerHTML = '';
        return;
    }

    legend.innerHTML = teams.map(team => `
        <div class="legend-item">
            <div class="legend-dot" style="background: ${team.color}"></div>
            <span>${team.name}</span>
        </div>
    `).join('');
}

/**
 * Save teams to localStorage
 */
function saveTeamsToStorage() {
    try {
        // Save team metadata (not full CSV content to save space)
        const teamsData = teams.map(t => ({
            id: t.id,
            name: t.name,
            color: t.color,
            csvA: { filename: t.csvA.filename, content: t.csvA.content },
            csvB: { filename: t.csvB.filename, content: t.csvB.content }
        }));

        localStorage.setItem('tpg_compare_teams', JSON.stringify(teamsData));
        localStorage.setItem('tpg_compare_nextId', nextTeamId.toString());
    } catch (e) {
        console.warn('Could not save teams to storage:', e);
    }
}

/**
 * Load teams from localStorage
 */
function loadTeamsFromStorage() {
    try {
        const teamsData = localStorage.getItem('tpg_compare_teams');
        const savedNextId = localStorage.getItem('tpg_compare_nextId');

        if (savedNextId) {
            nextTeamId = parseInt(savedNextId) || 1;
        }

        if (teamsData) {
            const parsed = JSON.parse(teamsData);

            teams = parsed.map(t => ({
                id: t.id,
                name: t.name,
                color: t.color,
                csvA: {
                    filename: t.csvA?.filename || '',
                    content: t.csvA?.content || '',
                    points: t.csvA?.content ? DataLoader.parseCSV(t.csvA.content, { defaultTitle: true }) : []
                },
                csvB: {
                    filename: t.csvB?.filename || '',
                    content: t.csvB?.content || '',
                    points: t.csvB?.content ? DataLoader.parseCSV(t.csvB.content, { defaultTitle: true }) : []
                },
                midpoints: [],
                midpointsCacheKey: null
            }));

            renderTeams();
            updateStats();
            updateLegend();
        }
    } catch (e) {
        console.warn('Could not load teams from storage:', e);
    }
}

// Leaderboard state
let leaderboardLayer = null;
let leaderboardTarget = null;
let selectedLeaderboardIndex = null;

/**
 * Calculate geodesic distance between two points using Turf.js (proper spherical earth)
 */
function geodesicDistance(p1, p2) {
    const from = turf.point([p1.lng, p1.lat]);
    const to = turf.point([p2.lng, p2.lat]);
    return turf.distance(from, to, { units: 'kilometers' });
}

/**
 * Calculate geodesic midpoint using Turf.js
 */
function geodesicMidpoint(p1, p2) {
    const from = turf.point([p1.lng, p1.lat]);
    const to = turf.point([p2.lng, p2.lat]);
    const mid = turf.midpoint(from, to);
    return {
        lat: mid.geometry.coordinates[1],
        lng: mid.geometry.coordinates[0]
    };
}

/**
 * Find best pair for a team at a given target location
 * Uses proper geodesic calculations
 */
function findBestPairForTeam(team, target) {
    if (team.csvA.points.length === 0 || team.csvB.points.length === 0) {
        return null;
    }

    let bestPair = null;
    let bestScore = Infinity;

    for (const pointA of team.csvA.points) {
        for (const pointB of team.csvB.points) {
            // Calculate geodesic midpoint
            const midpoint = geodesicMidpoint(pointA, pointB);

            // Calculate geodesic distance from midpoint to target
            const score = geodesicDistance(midpoint, target);

            if (score < bestScore) {
                bestScore = score;
                bestPair = {
                    pointA,
                    pointB,
                    midpoint,
                    score,
                    distAtoB: geodesicDistance(pointA, pointB)
                };
            }
        }
    }

    return bestPair;
}

/**
 * Show leaderboard for a specific location
 */
function showLeaderboard(target) {
    leaderboardTarget = target;
    selectedLeaderboardIndex = null;

    // Clear previous highlights
    if (leaderboardLayer) {
        leaderboardLayer.clearLayers();
    }

    // Dim the voronoi layer
    if (voronoiLayer) {
        voronoiLayer.eachLayer(layer => {
            if (layer.setStyle) {
                layer.setStyle({ fillOpacity: 0.15 });
            }
        });
    }

    // Calculate best pair for each team
    const results = [];
    for (const team of teams) {
        if (team.csvA.points.length === 0 || team.csvB.points.length === 0) continue;

        const bestPair = findBestPairForTeam(team, target);
        if (bestPair) {
            results.push({
                team,
                ...bestPair
            });
        }
    }

    // Sort by score (lower is better)
    results.sort((a, b) => a.score - b.score);

    // Update UI
    const leaderboard = document.getElementById('leaderboard');
    const coordsEl = document.getElementById('leaderboard-coords');
    const listEl = document.getElementById('leaderboard-list');

    coordsEl.textContent = `${target.lat.toFixed(5)}, ${target.lng.toFixed(5)}`;

    if (results.length === 0) {
        listEl.innerHTML = '<p style="color: var(--text-secondary); font-size: 12px; padding: 8px;">No teams with data loaded</p>';
    } else {
        listEl.innerHTML = results.map((r, idx) => `
            <div class="leaderboard-item" data-index="${idx}">
                <div class="leaderboard-item-header">
                    <span class="leaderboard-rank" style="background: ${r.team.color}">${idx + 1}</span>
                    <span class="leaderboard-team-name">${r.team.name}</span>
                    <span class="leaderboard-score">${r.score.toFixed(2)} km</span>
                </div>
                <div class="leaderboard-details">
                    <div>A: ${r.pointA.title || 'Point A'}</div>
                    <div>B: ${r.pointB.title || 'Point B'}</div>
                    <div>A↔B: ${r.distAtoB.toFixed(1)} km</div>
                </div>
            </div>
        `).join('');

        // Wire up click handlers to highlight single team
        listEl.querySelectorAll('.leaderboard-item').forEach(item => {
            item.addEventListener('click', () => {
                const idx = parseInt(item.dataset.index);
                selectedLeaderboardIndex = idx;
                highlightSingleResult(results[idx]);

                // Update selected state
                listEl.querySelectorAll('.leaderboard-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
            });
        });
    }

    leaderboard.classList.add('active');

    // Draw ALL teams' results at once
    drawAllLeaderboardResults(target, results);

    // Store results for later use
    leaderboard.dataset.results = JSON.stringify(results.map(r => ({
        teamId: r.team.id,
        teamColor: r.team.color,
        pointA: { lat: r.pointA.lat, lng: r.pointA.lng, title: r.pointA.title, radius: r.pointA.radius },
        pointB: { lat: r.pointB.lat, lng: r.pointB.lng, title: r.pointB.title, radius: r.pointB.radius },
        midpoint: r.midpoint,
        score: r.score
    })));
}

/**
 * Draw all teams' best results on the map
 */
function drawAllLeaderboardResults(target, results) {
    if (!leaderboardLayer) return;
    leaderboardLayer.clearLayers();

    // Target marker (prominent, red with white border)
    const targetMarker = L.circleMarker([target.lat, target.lng], {
        radius: 10,
        color: '#ffffff',
        fillColor: '#e74c3c',
        fillOpacity: 1,
        weight: 3
    });
    targetMarker.bindPopup(`<strong>Target</strong><br>${target.lat.toFixed(5)}, ${target.lng.toFixed(5)}`);
    targetMarker.addTo(leaderboardLayer);

    // Draw each team's result: Point A, Point B, Midpoint, Line A-B
    results.forEach((result, idx) => {
        const isWinner = idx === 0;
        const markerSize = isWinner ? 8 : 6;
        const lineWeight = isWinner ? 3 : 2;
        const opacity = isWinner ? 0.9 : 0.6;

        // Draw great circle line A to B
        MapUtils.drawGreatCircle(leaderboardLayer, result.pointA, result.pointB, {
            color: result.team.color,
            weight: lineWeight,
            opacity: opacity,
            dashArray: isWinner ? null : '5, 5'
        });

        // Point A marker
        const markerA = L.circleMarker([result.pointA.lat, result.pointA.lng], {
            radius: markerSize,
            color: result.team.color,
            fillColor: result.team.color,
            fillOpacity: 0.8,
            weight: 2
        });
        markerA.bindPopup(`<strong>${result.team.name} - A</strong><br>${result.pointA.title || 'Point A'}`);
        markerA.addTo(leaderboardLayer);

        // Point B marker
        const markerB = L.circleMarker([result.pointB.lat, result.pointB.lng], {
            radius: markerSize,
            color: result.team.color,
            fillColor: result.team.color,
            fillOpacity: 0.8,
            weight: 2
        });
        markerB.bindPopup(`<strong>${result.team.name} - B</strong><br>${result.pointB.title || 'Point B'}`);
        markerB.addTo(leaderboardLayer);

        // Midpoint marker (yellow fill, team color border)
        const midpointMarker = L.circleMarker([result.midpoint.lat, result.midpoint.lng], {
            radius: isWinner ? 9 : 6,
            color: result.team.color,
            fillColor: '#f1c40f',
            fillOpacity: 1,
            weight: 2
        });
        midpointMarker.bindPopup(`
            <strong>${result.team.name} Midpoint</strong><br>
            Rank: #${idx + 1}<br>
            Score: ${result.score.toFixed(2)} km
        `);
        midpointMarker.addTo(leaderboardLayer);
    });
}

/**
 * Highlight a single team's result (when clicking a leaderboard item)
 */
function highlightSingleResult(result) {
    if (!leaderboardLayer) return;

    leaderboardLayer.clearLayers();

    // Target marker
    const targetMarker = L.circleMarker([leaderboardTarget.lat, leaderboardTarget.lng], {
        radius: 10,
        color: '#ffffff',
        fillColor: '#e74c3c',
        fillOpacity: 1,
        weight: 3
    });
    targetMarker.bindPopup(`<strong>Target</strong><br>${leaderboardTarget.lat.toFixed(5)}, ${leaderboardTarget.lng.toFixed(5)}`);
    targetMarker.addTo(leaderboardLayer);

    // Draw great circle line A to B
    MapUtils.drawGreatCircle(leaderboardLayer, result.pointA, result.pointB, {
        color: result.team.color,
        weight: 3,
        opacity: 0.9,
        dashArray: null
    });

    // Point A marker
    const markerA = L.circleMarker([result.pointA.lat, result.pointA.lng], {
        radius: 9,
        color: result.team.color,
        fillColor: result.team.color,
        fillOpacity: 0.9,
        weight: 2
    });
    markerA.bindPopup(`<strong>${result.team.name} - A</strong><br>${result.pointA.title || 'Point A'}`);
    markerA.addTo(leaderboardLayer);

    // Point B marker
    const markerB = L.circleMarker([result.pointB.lat, result.pointB.lng], {
        radius: 9,
        color: result.team.color,
        fillColor: result.team.color,
        fillOpacity: 0.9,
        weight: 2
    });
    markerB.bindPopup(`<strong>${result.team.name} - B</strong><br>${result.pointB.title || 'Point B'}`);
    markerB.addTo(leaderboardLayer);

    // Midpoint marker (yellow fill, team color border)
    const midpointMarker = L.circleMarker([result.midpoint.lat, result.midpoint.lng], {
        radius: 10,
        color: result.team.color,
        fillColor: '#f1c40f',
        fillOpacity: 1,
        weight: 3
    });
    midpointMarker.bindPopup(`
        <strong>${result.team.name} Midpoint</strong><br>
        Score: ${result.score.toFixed(2)} km from target
    `);
    midpointMarker.addTo(leaderboardLayer);
}

/**
 * Hide leaderboard
 */
function hideLeaderboard() {
    const leaderboard = document.getElementById('leaderboard');
    leaderboard.classList.remove('active');

    if (leaderboardLayer) {
        leaderboardLayer.clearLayers();
    }

    // Restore voronoi opacity
    if (voronoiLayer) {
        voronoiLayer.eachLayer(layer => {
            if (layer.setStyle) {
                layer.setStyle({ fillOpacity: 0.5 });
            }
        });
    }

    leaderboardTarget = null;
    selectedLeaderboardIndex = null;
}

/**
 * Setup context menu for leaderboard
 */
function setupLeaderboardContextMenu() {
    // Create custom context menu
    const contextMenu = document.createElement('div');
    contextMenu.id = 'compare-context-menu';
    contextMenu.style.cssText = `
        position: fixed;
        background: var(--secondary-bg);
        border: 1px solid var(--accent);
        border-radius: 6px;
        padding: 4px 0;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        z-index: 10000;
        display: none;
        min-width: 180px;
        font-size: 13px;
    `;
    document.body.appendChild(contextMenu);

    let contextLatLng = null;

    // Helper to create menu items
    const createMenuItem = (label, onClick) => {
        const item = document.createElement('div');
        item.textContent = label;
        item.style.cssText = `
            padding: 8px 16px;
            cursor: pointer;
            color: var(--text-primary);
            transition: background 0.15s;
        `;
        item.addEventListener('mouseenter', () => item.style.background = 'var(--accent)');
        item.addEventListener('mouseleave', () => item.style.background = 'transparent');
        item.addEventListener('click', () => {
            onClick();
            contextMenu.style.display = 'none';
        });
        return item;
    };

    // Handle right-click on map
    map.on('contextmenu', (e) => {
        e.originalEvent.preventDefault();
        contextLatLng = e.latlng;

        // Clear and rebuild menu
        contextMenu.innerHTML = '';

        // Coordinate display
        const coordDisplay = document.createElement('div');
        coordDisplay.style.cssText = `
            padding: 8px 16px;
            color: var(--text-secondary);
            font-size: 11px;
            border-bottom: 1px solid var(--accent);
            margin-bottom: 4px;
        `;
        coordDisplay.textContent = `${contextLatLng.lat.toFixed(6)}, ${contextLatLng.lng.toFixed(6)}`;
        contextMenu.appendChild(coordDisplay);

        // Leaderboard option (most important, at top)
        contextMenu.appendChild(createMenuItem('Show Leaderboard', () => {
            showLeaderboard({ lat: contextLatLng.lat, lng: contextLatLng.lng });
        }));

        // Separator
        const sep = document.createElement('div');
        sep.style.cssText = 'border-top: 1px solid var(--accent); margin: 4px 0;';
        contextMenu.appendChild(sep);

        // Copy options
        contextMenu.appendChild(createMenuItem('Copy coordinates', async () => {
            const coords = `${contextLatLng.lat.toFixed(6)}, ${contextLatLng.lng.toFixed(6)}`;
            await navigator.clipboard.writeText(coords);
        }));

        contextMenu.appendChild(createMenuItem('Copy latitude', async () => {
            await navigator.clipboard.writeText(contextLatLng.lat.toFixed(6));
        }));

        contextMenu.appendChild(createMenuItem('Copy longitude', async () => {
            await navigator.clipboard.writeText(contextLatLng.lng.toFixed(6));
        }));

        // Position menu
        contextMenu.style.display = 'block';
        contextMenu.style.left = `${e.originalEvent.pageX}px`;
        contextMenu.style.top = `${e.originalEvent.pageY}px`;

        // Adjust if off screen
        const menuRect = contextMenu.getBoundingClientRect();
        if (menuRect.right > window.innerWidth) {
            contextMenu.style.left = `${window.innerWidth - menuRect.width - 10}px`;
        }
        if (menuRect.bottom > window.innerHeight) {
            contextMenu.style.top = `${window.innerHeight - menuRect.height - 10}px`;
        }
    });

    // Hide menu on click elsewhere
    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
    });

    // Hide menu on map move
    map.on('movestart zoomstart', () => {
        contextMenu.style.display = 'none';
    });
}

/**
 * Initialize application
 */
function init() {
    // Render navigation
    NavUtils.render('site-nav', 'compare');

    initMap();

    // Create leaderboard layer
    leaderboardLayer = L.layerGroup().addTo(map);

    // Setup custom context menu
    setupLeaderboardContextMenu();

    // Load saved teams
    loadTeamsFromStorage();

    // Wire up buttons
    document.getElementById('add-team-btn').addEventListener('click', addTeam);
    document.getElementById('generate-btn').addEventListener('click', generateVoronoiMap);
    document.getElementById('leaderboard-close').addEventListener('click', hideLeaderboard);

    // Initial render
    renderTeams();
    updateStats();
    updateLegend();
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

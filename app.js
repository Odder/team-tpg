/**
 * Main application logic for Geo Reflection Calculator
 */

// Source points (loaded from cellery-list file)
let SOURCE_POINTS = [];

// Application state
const state = {
    map: null,
    layers: null,
    measurementMarker: null,
    measurementLine: null,
    sourceToClickLine: null,
    midpointMarker: null,
    reflections: [],
    target: null,
    isLoading: true,
    activeReflectionIndex: null,
    activeSourceIndex: null
};

/**
 * Update file display UI
 */
function updateSourceFileDisplay(filename, count) {
    const nameEl = document.getElementById('source-file-name');
    const statusEl = document.getElementById('source-file-status');

    if (filename && count > 0) {
        nameEl.textContent = filename;
        statusEl.textContent = `${count} points loaded`;
    } else if (filename) {
        nameEl.textContent = filename;
        statusEl.textContent = 'No valid points';
    } else {
        nameEl.textContent = 'No file loaded';
        statusEl.textContent = 'Click to upload';
    }
}

/**
 * Handle file upload for source points
 */
function handleSourceFileUpload(event) {
    DataLoader.handleFileInput(event, 'reflection_source', (points, filename) => {
        SOURCE_POINTS = points;
        updateSourceFileDisplay(filename, points.length);
        drawSourcePoints();
    });
}

/**
 * Load source points from storage
 */
async function loadSourcePoints() {
    const result = await DataLoader.loadWithFallback('reflection_source', null);
    SOURCE_POINTS = result.points;
    updateSourceFileDisplay(result.filename, SOURCE_POINTS.length);
    return true; // Don't fail if no points - user can upload
}

/**
 * Initialize the Leaflet map
 */
function initMap() {
    // Create map using shared utility
    state.map = MapUtils.createMap('map');

    // Create layer groups
    state.layers = MapUtils.createLayers(state.map, ['source', 'target', 'reflection']);

    // Add context menu for copying coordinates
    MapUtils.addContextMenu(state.map);

    // Draw source points
    drawSourcePoints();

    // Add map click handler
    state.map.on('click', handleMapClick);
}

/**
 * Draw source points on the map as blue circles
 */
function drawSourcePoints() {
    state.layers.source.clearLayers();

    SOURCE_POINTS.forEach((point, index) => {
        // Check if this source is too far from target
        let isTooFar = false;
        if (state.target) {
            const distance = GeoCalc.getDistance(point, state.target);
            isTooFar = distance > GeoCalc.MAX_DISTANCE_KM;
        }

        // Check if this is the active source
        const isActive = index === state.activeSourceIndex;

        // Determine styling
        let color, fillOpacity, weight;
        if (isTooFar) {
            // Grey out sources that are too far
            color = '#555555';
            fillOpacity = 0.08;
            weight = 1;
        } else if (isActive) {
            // Highlight active source with bright orange
            color = '#ff6b35';
            fillOpacity = 0.5;
            weight = 5;
        } else {
            // Normal source
            color = '#3498db';
            fillOpacity = 0.15;
            weight = 2;
        }

        // Create circle
        const circle = L.circle([point.lat, point.lng], {
            radius: point.radius,
            color: color,
            fillColor: color,
            fillOpacity: fillOpacity,
            weight: weight
        });

        // Build popup header with ID and optional name
        const header = point.title
            ? `Source Point ${index + 1} - ${point.title}`
            : `Source Point ${index + 1}`;

        let popupContent = `
            <strong>${header}</strong><br>
            Lat: ${point.lat.toFixed(4)}<br>
            Lng: ${point.lng.toFixed(4)}<br>
            Radius: ${(point.radius / 1000).toFixed(0)} km
        `;

        if (isTooFar) {
            popupContent += `<br><em style="color: #999;">Too far from target</em>`;
        }

        circle.bindPopup(popupContent);
        circle.addTo(state.layers.source);

        // Add label for active source
        if (isActive) {
            const label = L.marker([point.lat, point.lng], {
                icon: L.divIcon({
                    className: 'source-label',
                    html: '<div style="background: #ff6b35; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">SOURCE</div>',
                    iconSize: [60, 20],
                    iconAnchor: [30, -10]
                })
            });
            label.addTo(state.layers.source);
        }
    });
}

/**
 * Parse coordinate input and validate (delegates to CoordUtils)
 */
function parseCoordinates(input) {
    return CoordUtils.parse(input);
}

/**
 * Calculate and draw reflections
 */
function calculateReflections() {
    const input = document.getElementById('target-coords').value;
    const target = parseCoordinates(input);

    if (!target) {
        alert('Invalid coordinates. Please use format: lat, lng (e.g., 40.7128, -74.0060)');
        return;
    }

    // Save target for other pages
    CoordUtils.saveTarget(input);

    state.target = target;

    // Clear active highlights
    state.activeReflectionIndex = null;
    state.activeSourceIndex = null;

    // Calculate reflections
    state.reflections = GeoCalc.calculateAllReflections(SOURCE_POINTS, target);

    // Re-draw sources (to show greyed out ones), target, and reflections
    drawSourcePoints();
    drawTarget(target);
    drawReflections(state.reflections);

    // Keep zoom at level 2 (don't auto-zoom)
    // zoomToFitAll();

    // Show distance info message
    const distanceInfo = document.getElementById('distance-info');
    distanceInfo.classList.remove('hidden');
}

/**
 * Draw target point as red marker
 * @param {Object} target - Target coordinates {lat, lng}
 */
function drawTarget(target) {
    state.layers.target.clearLayers();

    MapUtils.drawMarker(state.layers.target, target, {
        color: MapUtils.colors.red,
        fillColor: MapUtils.colors.red
    }, `
        <strong>Target Point</strong><br>
        Lat: ${target.lat.toFixed(4)}<br>
        Lng: ${target.lng.toFixed(4)}
    `);
}

/**
 * Draw reflection points as circles
 * Green = good reflections, Orange = antipodal (>10,000km, midpoint approaches antipode)
 * @param {Array} reflections - Array of reflection objects
 */
function drawReflections(reflections) {
    state.layers.reflection.clearLayers();

    reflections.forEach((reflection, index) => {
        // Check if this is the active reflection
        const isActive = index === state.activeReflectionIndex;

        // Check if source is too far from target
        const sourcePoint = SOURCE_POINTS[reflection.sourceIndex];
        let isTooFar = false;
        if (state.target) {
            const distance = GeoCalc.getDistance(sourcePoint, state.target);
            isTooFar = distance > GeoCalc.MAX_DISTANCE_KM;
        }

        // Determine styling
        let color, fillOpacity, weight;
        if (isTooFar) {
            // Grey out reflections from sources that are too far
            color = '#555555';
            fillOpacity = 0.08;
            weight = 1;
        } else if (isActive) {
            // Highlight active reflection
            color = '#ff6b35';
            fillOpacity = 0.5;
            weight = 5;
        } else if (reflection.isAntipodal) {
            // Antipodal reflection (>10,000km) - orange to indicate less useful
            color = '#e67e22';
            fillOpacity = 0.12;
            weight = 2;
        } else {
            // Good reflection (within quarter Earth circumference)
            color = '#2ecc71';
            fillOpacity = 0.15;
            weight = 2;
        }

        const circle = L.circle([reflection.lat, reflection.lng], {
            radius: reflection.radius,
            color: color,
            fillColor: color,
            fillOpacity: fillOpacity,
            weight: weight
        });

        // Use sourcePoint already declared above
        const sourceLabel = sourcePoint.title
            ? `${sourcePoint.title} (${reflection.sourceIndex + 1})`
            : `Source ${reflection.sourceIndex + 1}`;

        const header = sourcePoint.title
            ? `Reflection ${index + 1} - ${sourcePoint.title}`
            : `Reflection Point ${index + 1}`;

        let popupContent = `
            <strong>${header}</strong><br>
            Lat: ${reflection.lat.toFixed(4)}<br>
            Lng: ${reflection.lng.toFixed(4)}<br>
            Radius: ${(reflection.radius / 1000).toFixed(0)} km<br>
            <br>
            <em>Reflected from ${sourceLabel}</em><br>
            Distance: ${GeoCalc.formatDistance(reflection.distance * 2)}
        `;

        if (isTooFar) {
            popupContent += `<br><em style="color: #999;">Source too far from target</em>`;
        } else if (reflection.isAntipodal) {
            popupContent += `<br><em style="color: #e67e22;">Antipodal reflection (>${Math.round(GeoCalc.ANTIPODAL_THRESHOLD_KM / 1000)}k km)</em>`;
        }

        circle.bindPopup(popupContent);

        circle.addTo(state.layers.reflection);
    });
}

/**
 * Zoom map to fit all points (sources, target, reflections)
 */
function zoomToFitAll() {
    const bounds = L.latLngBounds();

    // Add source points
    SOURCE_POINTS.forEach(point => {
        bounds.extend([point.lat, point.lng]);
    });

    // Add target
    if (state.target) {
        bounds.extend([state.target.lat, state.target.lng]);
    }

    // Add reflections
    state.reflections.forEach(reflection => {
        bounds.extend([reflection.lat, reflection.lng]);
    });

    if (bounds.isValid()) {
        state.map.fitBounds(bounds, { padding: [50, 50] });
    }
}

/**
 * Handle map click to show distance to nearest reflection
 * @param {Object} e - Leaflet map click event
 */
function handleMapClick(e) {
    // Only process if we have reflections
    if (!state.reflections || state.reflections.length === 0) {
        return;
    }

    const clickPoint = { lat: e.latlng.lat, lng: e.latlng.lng };
    const nearest = GeoCalc.findNearestReflection(clickPoint, state.reflections, SOURCE_POINTS, state.target);

    if (!nearest) {
        return;
    }

    // Set active reflection and source for highlighting
    state.activeReflectionIndex = nearest.index;
    state.activeSourceIndex = nearest.reflection.sourceIndex;

    // Re-render to apply highlighting
    drawSourcePoints();
    drawReflections(state.reflections);

    // Remove previous measurement markers and lines if exist
    if (state.measurementMarker) {
        state.map.removeLayer(state.measurementMarker);
    }
    if (state.measurementLine) {
        state.map.removeLayer(state.measurementLine);
    }
    if (state.sourceToClickLine) {
        state.map.removeLayer(state.sourceToClickLine);
    }
    if (state.midpointMarker) {
        state.map.removeLayer(state.midpointMarker);
    }

    // Get source point
    const sourcePoint = SOURCE_POINTS[nearest.reflection.sourceIndex];

    // Create new measurement marker at click point
    state.measurementMarker = L.circleMarker([clickPoint.lat, clickPoint.lng], {
        radius: 6,
        color: '#f39c12',
        fillColor: '#f39c12',
        fillOpacity: 0.8,
        weight: 2
    });

    // Create dotted line to nearest reflection
    const reflectionCenter = [nearest.reflection.lat, nearest.reflection.lng];
    state.measurementLine = L.polyline([
        [clickPoint.lat, clickPoint.lng],
        reflectionCenter
    ], {
        color: '#f39c12',
        weight: 2,
        opacity: 0.7,
        dashArray: '10, 10'
    }).addTo(state.map);

    // Create geodesic line from click to source (curved for globe)
    const clickTurf = turf.point([clickPoint.lng, clickPoint.lat]);
    const sourceTurf = turf.point([sourcePoint.lng, sourcePoint.lat]);
    const greatCircle = turf.greatCircle(clickTurf, sourceTurf);

    state.sourceToClickLine = L.geoJSON(greatCircle, {
        style: {
            color: '#9b59b6',
            weight: 2,
            opacity: 0.7,
            dashArray: '10, 10'
        }
    }).addTo(state.map);

    // Calculate midpoint between click and source
    const midpointTurf = turf.midpoint(clickTurf, sourceTurf);
    const midpoint = {
        lat: midpointTurf.geometry.coordinates[1],
        lng: midpointTurf.geometry.coordinates[0]
    };

    // Calculate distance from midpoint to target
    const midpointToTargetDistance = state.target ? GeoCalc.getDistance(midpoint, state.target) : 0;

    // Create midpoint marker
    state.midpointMarker = L.circleMarker([midpoint.lat, midpoint.lng], {
        radius: 8,
        color: '#9b59b6',
        fillColor: '#9b59b6',
        fillOpacity: 0.9,
        weight: 3
    });

    state.midpointMarker.bindPopup(`
        <strong>Midpoint (Click ↔ Source)</strong><br>
        Lat: ${midpoint.lat.toFixed(6)}<br>
        Lng: ${midpoint.lng.toFixed(6)}<br>
        <br>
        <strong style="color: #e74c3c;">Score Distance:</strong><br>
        ${GeoCalc.formatDistance(midpointToTargetDistance)} from target
    `);

    state.midpointMarker.addTo(state.map);

    // Get source point info for labeling
    const reflectionLabel = sourcePoint.title
        ? `${sourcePoint.title} (${nearest.index + 1})`
        : `Reflection ${nearest.index + 1}`;

    // Create popup content
    let popupContent = `<strong>Measurement Point</strong><br>`;

    if (nearest.isInside) {
        popupContent += `<span style="color: #2ecc71;">Inside ${reflectionLabel}</span><br>`;
        popupContent += `Distance to center: ${GeoCalc.formatDistance(nearest.distanceToCenter)}`;
    } else {
        popupContent += `Nearest: ${reflectionLabel}<br>`;
        popupContent += `Distance: ${GeoCalc.formatDistance(nearest.distanceToEdge)}`;
    }

    state.measurementMarker.bindPopup(popupContent).openPopup();
    state.measurementMarker.addTo(state.map);

    // Update distance info panel
    const distanceInfo = document.getElementById('distance-info');
    distanceInfo.classList.add('active');

    if (nearest.isInside) {
        distanceInfo.textContent = `You are inside ${reflectionLabel}! Distance to center: ${GeoCalc.formatDistance(nearest.distanceToCenter)} | Score: ${GeoCalc.formatDistance(midpointToTargetDistance)}`;
    } else {
        distanceInfo.textContent = `Nearest: ${reflectionLabel} - Distance: ${GeoCalc.formatDistance(nearest.distanceToEdge)} | Score: ${GeoCalc.formatDistance(midpointToTargetDistance)}`;
    }
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

        // Trigger calculation
        setTimeout(() => {
            calculateReflections();
        }, 500); // Small delay to ensure map is ready

        return true;
    }

    return false;
}

/**
 * Initialize application
 */
async function init() {
    // Render navigation
    NavUtils.render('site-nav', 'index');

    // Load source points from storage
    await loadSourcePoints();

    state.isLoading = false;

    // Initialize map
    initMap();

    // File upload handlers
    document.getElementById('source-file-btn').addEventListener('click', () => {
        document.getElementById('source-file').click();
    });
    document.getElementById('source-file').addEventListener('change', handleSourceFileUpload);

    // Set up event listeners
    document.getElementById('calculate-btn').addEventListener('click', calculateReflections);

    // Allow Enter key to trigger calculation
    document.getElementById('target-coords').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            calculateReflections();
        }
    });

    // Load from URL hash if present, otherwise load saved target
    if (!loadFromUrlHash()) {
        const savedTarget = CoordUtils.loadTarget();
        if (savedTarget) {
            document.getElementById('target-coords').value = savedTarget;
        }
    }
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

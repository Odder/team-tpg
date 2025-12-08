/**
 * Midpoint Calculator
 * Interactive tool to find the midpoint between two points
 */

// State
const state = {
    map: null,
    layers: null,
    pointA: null,
    pointB: null,
    midpoint: null,
    target: null,
    markerA: null,
    markerB: null,
    nextPoint: 'A' // Which point to place next on click
};

/**
 * Initialize the map
 */
function initMap() {
    state.map = MapUtils.createMap('map');
    state.layers = MapUtils.createLayers(state.map, ['points', 'midpoint', 'line', 'target']);
    MapUtils.addContextMenu(state.map);

    // Map click handler
    state.map.on('click', handleMapClick);
}

/**
 * Handle map click - place point A or B
 */
function handleMapClick(e) {
    const coords = { lat: e.latlng.lat, lng: e.latlng.lng };

    if (state.nextPoint === 'A') {
        setPointA(coords);
        state.nextPoint = 'B';
    } else {
        setPointB(coords);
        state.nextPoint = 'A';
    }
}

/**
 * Set Point A
 */
function setPointA(coords) {
    state.pointA = coords;
    document.getElementById('point-a-coords').value = `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
    updateVisualization();
}

/**
 * Set Point B
 */
function setPointB(coords) {
    state.pointB = coords;
    document.getElementById('point-b-coords').value = `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
    updateVisualization();
}

/**
 * Set Target
 */
function setTarget(coords) {
    state.target = coords;
    updateVisualization();
}

/**
 * Calculate midpoint between A and B
 */
function calculateMidpoint() {
    if (!state.pointA || !state.pointB) {
        state.midpoint = null;
        return null;
    }

    const aTurf = turf.point([state.pointA.lng, state.pointA.lat]);
    const bTurf = turf.point([state.pointB.lng, state.pointB.lat]);
    const midTurf = turf.midpoint(aTurf, bTurf);

    state.midpoint = {
        lat: midTurf.geometry.coordinates[1],
        lng: midTurf.geometry.coordinates[0]
    };

    return state.midpoint;
}

/**
 * Update all visualization on map
 */
function updateVisualization() {
    // Clear layers
    state.layers.points.clearLayers();
    state.layers.midpoint.clearLayers();
    state.layers.line.clearLayers();
    state.layers.target.clearLayers();

    // Draw Point A (draggable)
    if (state.pointA) {
        state.markerA = L.circleMarker([state.pointA.lat, state.pointA.lng], {
            radius: 12,
            color: MapUtils.colors.blue,
            fillColor: MapUtils.colors.blue,
            fillOpacity: 0.8,
            weight: 3
        });
        state.markerA.bindPopup('<strong>Point A</strong><br>Drag to move');

        // Make draggable
        makeDraggable(state.markerA, (newCoords) => {
            setPointA(newCoords);
        });

        state.markerA.addTo(state.layers.points);
    }

    // Draw Point B (draggable)
    if (state.pointB) {
        state.markerB = L.circleMarker([state.pointB.lat, state.pointB.lng], {
            radius: 12,
            color: MapUtils.colors.purple,
            fillColor: MapUtils.colors.purple,
            fillOpacity: 0.8,
            weight: 3
        });
        state.markerB.bindPopup('<strong>Point B</strong><br>Drag to move');

        // Make draggable
        makeDraggable(state.markerB, (newCoords) => {
            setPointB(newCoords);
        });

        state.markerB.addTo(state.layers.points);
    }

    // Draw great circle line between A and B
    if (state.pointA && state.pointB) {
        MapUtils.drawGreatCircle(state.layers.line, state.pointA, state.pointB, {
            color: '#95a5a6',
            weight: 2,
            opacity: 0.6
        });
    }

    // Calculate and draw midpoint
    const midpoint = calculateMidpoint();
    if (midpoint) {
        MapUtils.drawMarker(state.layers.midpoint, midpoint, {
            radius: 14,
            color: MapUtils.colors.yellow,
            fillColor: MapUtils.colors.yellow,
            fillOpacity: 0.9,
            weight: 3
        }, `
            <strong>Midpoint</strong><br>
            Lat: ${midpoint.lat.toFixed(6)}<br>
            Lng: ${midpoint.lng.toFixed(6)}
        `);

        // Show midpoint result
        document.getElementById('midpoint-result').style.display = 'block';
        document.getElementById('midpoint-coords').textContent =
            `${midpoint.lat.toFixed(6)}, ${midpoint.lng.toFixed(6)}`;
    } else {
        document.getElementById('midpoint-result').style.display = 'none';
    }

    // Draw target if set
    if (state.target) {
        MapUtils.drawMarker(state.layers.target, state.target, {
            radius: 8,
            color: MapUtils.colors.red,
            fillColor: MapUtils.colors.red,
            fillOpacity: 0.9
        }, `
            <strong>Target</strong><br>
            Lat: ${state.target.lat.toFixed(6)}<br>
            Lng: ${state.target.lng.toFixed(6)}
        `);
    }

    // Update distances
    updateDistances();
}

/**
 * Make a marker draggable
 */
function makeDraggable(marker, onDrag) {
    let isDragging = false;

    marker.on('mousedown', (e) => {
        isDragging = true;
        state.map.dragging.disable();
        L.DomEvent.stopPropagation(e);
    });

    state.map.on('mousemove', (e) => {
        if (isDragging) {
            const newCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
            onDrag(newCoords);
        }
    });

    state.map.on('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            state.map.dragging.enable();
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            state.map.dragging.enable();
        }
    });
}

/**
 * Update distance displays
 */
function updateDistances() {
    const distAB = document.getElementById('dist-a-b');
    const distMidTarget = document.getElementById('dist-mid-target');
    const distInfo = document.getElementById('distance-info');

    // Distance A to B
    if (state.pointA && state.pointB) {
        const dist = CoordUtils.distance(state.pointA, state.pointB);
        distAB.textContent = CoordUtils.formatDistance(dist);
    } else {
        distAB.textContent = '--';
    }

    // Distance Midpoint to Target
    if (state.midpoint && state.target) {
        const dist = CoordUtils.distance(state.midpoint, state.target);
        distMidTarget.textContent = CoordUtils.formatDistance(dist);
        distInfo.classList.add('has-target');
    } else {
        distMidTarget.textContent = '--';
        distInfo.classList.remove('has-target');
    }
}

/**
 * Parse coordinate input
 */
function parseCoordinates(input) {
    return CoordUtils.parse(input);
}

/**
 * Handle input change for Point A
 */
function handlePointAInput() {
    const input = document.getElementById('point-a-coords').value;
    const coords = parseCoordinates(input);
    if (coords) {
        state.pointA = coords;
        state.nextPoint = 'B';
        updateVisualization();
    }
}

/**
 * Handle input change for Point B
 */
function handlePointBInput() {
    const input = document.getElementById('point-b-coords').value;
    const coords = parseCoordinates(input);
    if (coords) {
        state.pointB = coords;
        state.nextPoint = 'A';
        updateVisualization();
    }
}

/**
 * Handle input change for Target
 */
function handleTargetInput() {
    const input = document.getElementById('target-coords').value;
    const coords = parseCoordinates(input);
    if (coords) {
        state.target = coords;
        // Save target for other pages
        CoordUtils.saveTarget(input);
        updateVisualization();
    } else if (input.trim() === '') {
        state.target = null;
        updateVisualization();
    }
}

/**
 * Copy midpoint to clipboard
 */
async function copyMidpoint() {
    if (state.midpoint) {
        const text = `${state.midpoint.lat.toFixed(6)}, ${state.midpoint.lng.toFixed(6)}`;
        const success = await CoordUtils.copyToClipboard(text);
        if (success) {
            const btn = document.getElementById('copy-midpoint-btn');
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 1500);
        }
    }
}

/**
 * Open midpoint in Google Maps
 */
function openInGoogleMaps() {
    if (state.midpoint) {
        const url = CoordUtils.googleMapsUrl(state.midpoint.lat, state.midpoint.lng);
        window.open(url, '_blank');
    }
}

/**
 * Initialize application
 */
function init() {
    // Render navigation
    NavUtils.render('site-nav', 'midpoint');

    // Initialize map
    initMap();

    // Event listeners for inputs
    document.getElementById('point-a-coords').addEventListener('change', handlePointAInput);
    document.getElementById('point-a-coords').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handlePointAInput();
    });

    document.getElementById('point-b-coords').addEventListener('change', handlePointBInput);
    document.getElementById('point-b-coords').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handlePointBInput();
    });

    document.getElementById('target-coords').addEventListener('change', handleTargetInput);
    document.getElementById('target-coords').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleTargetInput();
    });

    // Button listeners
    document.getElementById('copy-midpoint-btn').addEventListener('click', copyMidpoint);
    document.getElementById('open-maps-btn').addEventListener('click', openInGoogleMaps);

    // Load saved target
    const savedTarget = CoordUtils.loadTarget();
    if (savedTarget) {
        document.getElementById('target-coords').value = savedTarget;
        const coords = parseCoordinates(savedTarget);
        if (coords) {
            state.target = coords;
        }
    }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

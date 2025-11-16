/**
 * Main application logic for Geo Reflection Calculator
 */

// Source points (loaded from cellery-list file)
let SOURCE_POINTS = [];

// Application state
const state = {
    map: null,
    sourceLayers: null,
    targetLayer: null,
    reflectionLayers: null,
    measurementMarker: null,
    measurementLine: null,
    reflections: [],
    target: null,
    isLoading: true,
    activeReflectionIndex: null,
    activeSourceIndex: null
};

/**
 * Load source points from cellery-list file
 * Supports formats:
 *   - lng,lat,radius_km
 *   - lng,lat,radius_km,"title"
 */
async function loadSourcePoints() {
    try {
        const response = await fetch('cellery-list.csv');
        const text = await response.text();

        // Parse each line
        SOURCE_POINTS = text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map((line, index) => {
                // Check if line has a title (contains quoted text)
                const titleMatch = line.match(/"([^"]+)"/);
                const title = titleMatch ? titleMatch[1] : null;

                // Remove title from line for easier parsing
                const dataLine = title ? line.replace(/"[^"]+"/, '').trim() : line;

                // Parse lng,lat,radius_km
                const parts = dataLine.split(',').map(s => s.trim()).filter(s => s);
                const [lng, lat, radiusKm] = parts.map(parseFloat);

                if (isNaN(lng) || isNaN(lat) || isNaN(radiusKm)) {
                    console.warn(`Skipping invalid line ${index + 1}: ${line}`);
                    return null;
                }

                return {
                    lat: lat,
                    lng: lng,
                    radius: radiusKm * 1000, // Convert km to meters
                    title: title
                };
            })
            .filter(point => point !== null);

        console.log(`Loaded ${SOURCE_POINTS.length} source points from cellery-list`);
        return true;
    } catch (error) {
        console.error('Error loading cellery-list:', error);
        alert('Failed to load cellery-list file. Please make sure the file exists.');
        return false;
    }
}

/**
 * Initialize the Leaflet map
 */
function initMap() {
    // Create map
    state.map = L.map('map', {
        center: [20, 0],
        zoom: 2,
        minZoom: 2,
        maxZoom: 18
    });

    // Add tile layer (using CartoDB Dark Matter for modern look)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(state.map);

    // Initialize layer groups
    state.sourceLayers = L.layerGroup().addTo(state.map);
    state.targetLayer = L.layerGroup().addTo(state.map);
    state.reflectionLayers = L.layerGroup().addTo(state.map);

    // Draw source points
    drawSourcePoints();

    // Add map click handler
    state.map.on('click', handleMapClick);
}

/**
 * Draw source points on the map as blue circles
 */
function drawSourcePoints() {
    state.sourceLayers.clearLayers();

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
        circle.addTo(state.sourceLayers);

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
            label.addTo(state.sourceLayers);
        }
    });
}

/**
 * Parse coordinate input and validate
 * @param {string} input - Coordinate input string
 * @returns {Object|null} Parsed coordinates {lat, lng} or null if invalid
 */
function parseCoordinates(input) {
    // Remove extra spaces and split by comma
    const parts = input.trim().split(',').map(p => p.trim());

    if (parts.length !== 2) {
        return null;
    }

    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);

    // Validate ranges
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return null;
    }

    return { lat, lng };
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

    // Zoom to show all points
    zoomToFitAll();

    // Show distance info message
    const distanceInfo = document.getElementById('distance-info');
    distanceInfo.classList.remove('hidden');
}

/**
 * Draw target point as red marker
 * @param {Object} target - Target coordinates {lat, lng}
 */
function drawTarget(target) {
    state.targetLayer.clearLayers();

    const marker = L.circleMarker([target.lat, target.lng], {
        radius: 8,
        color: '#e74c3c',
        fillColor: '#e74c3c',
        fillOpacity: 0.8,
        weight: 3
    });

    marker.bindPopup(`
        <strong>Target Point</strong><br>
        Lat: ${target.lat.toFixed(4)}<br>
        Lng: ${target.lng.toFixed(4)}
    `);

    marker.addTo(state.targetLayer);
}

/**
 * Draw reflection points as green circles
 * @param {Array} reflections - Array of reflection objects
 */
function drawReflections(reflections) {
    state.reflectionLayers.clearLayers();

    reflections.forEach((reflection, index) => {
        // Check if this is the active reflection
        const isActive = index === state.activeReflectionIndex;

        // Determine styling
        const color = isActive ? '#ff6b35' : '#2ecc71';
        const fillOpacity = isActive ? 0.5 : 0.15;
        const weight = isActive ? 5 : 2;

        const circle = L.circle([reflection.lat, reflection.lng], {
            radius: reflection.radius,
            color: color,
            fillColor: color,
            fillOpacity: fillOpacity,
            weight: weight
        });

        const sourcePoint = SOURCE_POINTS[reflection.sourceIndex];
        const sourceLabel = sourcePoint.title
            ? `${sourcePoint.title} (${reflection.sourceIndex + 1})`
            : `Source ${reflection.sourceIndex + 1}`;

        const header = sourcePoint.title
            ? `Reflection ${index + 1} - ${sourcePoint.title}`
            : `Reflection Point ${index + 1}`;

        circle.bindPopup(`
            <strong>${header}</strong><br>
            Lat: ${reflection.lat.toFixed(4)}<br>
            Lng: ${reflection.lng.toFixed(4)}<br>
            Radius: ${(reflection.radius / 1000).toFixed(0)} km<br>
            <br>
            <em>Reflected from ${sourceLabel}</em><br>
            Distance: ${GeoCalc.formatDistance(reflection.distance * 2)}
        `);

        circle.addTo(state.reflectionLayers);
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
    const nearest = GeoCalc.findNearestReflection(clickPoint, state.reflections);

    if (!nearest) {
        return;
    }

    // Set active reflection and source for highlighting
    state.activeReflectionIndex = nearest.index;
    state.activeSourceIndex = nearest.reflection.sourceIndex;

    // Re-render to apply highlighting
    drawSourcePoints();
    drawReflections(state.reflections);

    // Remove previous measurement marker and line if exists
    if (state.measurementMarker) {
        state.map.removeLayer(state.measurementMarker);
    }
    if (state.measurementLine) {
        state.map.removeLayer(state.measurementLine);
    }

    // Create new measurement marker
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

    // Get source point info for labeling
    const sourcePoint = SOURCE_POINTS[nearest.reflection.sourceIndex];
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
        distanceInfo.textContent = `You are inside ${reflectionLabel}! Distance to center: ${GeoCalc.formatDistance(nearest.distanceToCenter)}`;
    } else {
        distanceInfo.textContent = `Nearest reflection: ${reflectionLabel} - Distance: ${GeoCalc.formatDistance(nearest.distanceToEdge)}`;
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
    // Load source points from file first
    const loaded = await loadSourcePoints();

    if (!loaded) {
        return; // Exit if loading failed
    }

    state.isLoading = false;

    // Initialize map
    initMap();

    // Set up event listeners
    document.getElementById('calculate-btn').addEventListener('click', calculateReflections);

    // Allow Enter key to trigger calculation
    document.getElementById('target-coords').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            calculateReflections();
        }
    });

    // Load from URL hash if present
    loadFromUrlHash();
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

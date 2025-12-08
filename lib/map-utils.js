/**
 * Map utilities - Consolidated Leaflet map initialization and common operations
 */

const MapUtils = {
    /**
     * Default map configuration
     */
    defaults: {
        center: [20, 0],
        zoom: 3,
        minZoom: 2,
        maxZoom: 18,
        tileUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        tileOptions: {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }
    },

    /**
     * Initialize a Leaflet map with standard configuration
     * @param {string} elementId - DOM element ID for the map container
     * @param {Object} options - Optional overrides for map configuration
     * @returns {L.Map} Initialized Leaflet map
     */
    createMap(elementId, options = {}) {
        const config = {
            center: options.center || this.defaults.center,
            zoom: options.zoom || this.defaults.zoom,
            minZoom: options.minZoom || this.defaults.minZoom,
            maxZoom: options.maxZoom || this.defaults.maxZoom
        };

        const map = L.map(elementId, config);

        // Add tile layer
        const tileUrl = options.tileUrl || this.defaults.tileUrl;
        const tileOptions = { ...this.defaults.tileOptions, ...options.tileOptions };
        L.tileLayer(tileUrl, tileOptions).addTo(map);

        return map;
    },

    /**
     * Create and add layer groups to a map
     * @param {L.Map} map - Leaflet map instance
     * @param {string[]} layerNames - Array of layer group names
     * @returns {Object} Object with layer groups keyed by name
     */
    createLayers(map, layerNames) {
        const layers = {};
        layerNames.forEach(name => {
            layers[name] = L.layerGroup().addTo(map);
        });
        return layers;
    },

    /**
     * Draw a circle on a layer
     * @param {L.LayerGroup} layer - Layer to add circle to
     * @param {Object} point - Point object with lat, lng, radius (in meters)
     * @param {Object} style - Circle style options
     * @param {string} popupContent - Optional popup HTML content
     * @returns {L.Circle} Created circle
     */
    drawCircle(layer, point, style = {}, popupContent = null) {
        const defaultStyle = {
            color: '#3498db',
            fillColor: '#3498db',
            fillOpacity: 0.15,
            weight: 2
        };

        const circle = L.circle([point.lat, point.lng], {
            radius: point.radius,
            ...defaultStyle,
            ...style
        });

        if (popupContent) {
            circle.bindPopup(popupContent);
        }

        circle.addTo(layer);
        return circle;
    },

    /**
     * Draw a circle marker (fixed pixel size) on a layer
     * @param {L.LayerGroup} layer - Layer to add marker to
     * @param {Object} point - Point object with lat, lng
     * @param {Object} style - Marker style options
     * @param {string} popupContent - Optional popup HTML content
     * @returns {L.CircleMarker} Created marker
     */
    drawMarker(layer, point, style = {}, popupContent = null) {
        const defaultStyle = {
            radius: 8,
            color: '#e74c3c',
            fillColor: '#e74c3c',
            fillOpacity: 0.8,
            weight: 3
        };

        const marker = L.circleMarker([point.lat, point.lng], {
            ...defaultStyle,
            ...style
        });

        if (popupContent) {
            marker.bindPopup(popupContent);
        }

        marker.addTo(layer);
        return marker;
    },

    /**
     * Draw a great circle line between two points
     * @param {L.LayerGroup} layer - Layer to add line to
     * @param {Object} pointA - First point {lat, lng}
     * @param {Object} pointB - Second point {lat, lng}
     * @param {Object} style - Line style options
     * @returns {L.GeoJSON} Created line
     */
    drawGreatCircle(layer, pointA, pointB, style = {}) {
        const defaultStyle = {
            color: '#95a5a6',
            weight: 2,
            opacity: 0.5,
            dashArray: '5, 5'
        };

        const aTurf = turf.point([pointA.lng, pointA.lat]);
        const bTurf = turf.point([pointB.lng, pointB.lat]);
        const greatCircle = turf.greatCircle(aTurf, bTurf);

        const line = L.geoJSON(greatCircle, {
            style: { ...defaultStyle, ...style }
        });

        line.addTo(layer);
        return line;
    },

    /**
     * Fit map bounds to include all given points
     * @param {L.Map} map - Leaflet map instance
     * @param {Object[]} points - Array of points with lat, lng
     * @param {Object} options - fitBounds options
     */
    fitToPoints(map, points, options = { padding: [50, 50] }) {
        if (!points || points.length === 0) return;

        const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
        if (bounds.isValid()) {
            map.fitBounds(bounds, options);
        }
    },

    /**
     * Color palette for consistent styling across the app
     */
    colors: {
        blue: '#3498db',
        purple: '#9b59b6',
        green: '#2ecc71',
        red: '#e74c3c',
        yellow: '#f1c40f',
        orange: '#f39c12',
        grey: '#555555'
    },

    /**
     * Add right-click context menu to map for copying coordinates
     * @param {L.Map} map - Leaflet map instance
     * @param {Function} onCopy - Optional callback after copy (receives coords)
     */
    addContextMenu(map, onCopy = null) {
        // Create context menu element
        const menu = document.createElement('div');
        menu.className = 'map-context-menu';
        menu.style.cssText = `
            display: none;
            position: fixed;
            background: var(--secondary-bg, #16213e);
            border: 1px solid var(--accent, #0f3460);
            border-radius: 6px;
            padding: 4px 0;
            min-width: 180px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            font-size: 13px;
        `;
        document.body.appendChild(menu);

        let clickCoords = null;

        // Context menu item template
        const createMenuItem = (label, onClick) => {
            const item = document.createElement('div');
            item.textContent = label;
            item.style.cssText = `
                padding: 8px 16px;
                cursor: pointer;
                color: var(--text-primary, #e4e4e4);
                transition: background 0.15s;
            `;
            item.addEventListener('mouseenter', () => {
                item.style.background = 'var(--accent, #0f3460)';
            });
            item.addEventListener('mouseleave', () => {
                item.style.background = 'transparent';
            });
            item.addEventListener('click', onClick);
            return item;
        };

        // Hide menu on click elsewhere
        document.addEventListener('click', () => {
            menu.style.display = 'none';
        });

        // Hide menu on map interaction
        map.on('movestart zoomstart', () => {
            menu.style.display = 'none';
        });

        // Show context menu on right-click
        map.getContainer().addEventListener('contextmenu', (e) => {
            e.preventDefault();

            // Get coordinates from click position
            const rect = map.getContainer().getBoundingClientRect();
            const point = L.point(e.clientX - rect.left, e.clientY - rect.top);
            const latlng = map.containerPointToLatLng(point);
            clickCoords = { lat: latlng.lat, lng: latlng.lng };

            // Clear and rebuild menu
            menu.innerHTML = '';

            // Coordinate display
            const coordDisplay = document.createElement('div');
            coordDisplay.style.cssText = `
                padding: 8px 16px;
                color: var(--text-secondary, #a0a0a0);
                font-size: 11px;
                border-bottom: 1px solid var(--accent, #0f3460);
                margin-bottom: 4px;
            `;
            coordDisplay.textContent = `${clickCoords.lat.toFixed(6)}, ${clickCoords.lng.toFixed(6)}`;
            menu.appendChild(coordDisplay);

            // Copy coordinates option
            menu.appendChild(createMenuItem('Copy coordinates', async () => {
                const coordStr = `${clickCoords.lat.toFixed(6)}, ${clickCoords.lng.toFixed(6)}`;
                await CoordUtils.copyToClipboard(coordStr);
                menu.style.display = 'none';
                if (onCopy) onCopy(clickCoords);
            }));

            // Copy as lat only
            menu.appendChild(createMenuItem('Copy latitude', async () => {
                await CoordUtils.copyToClipboard(clickCoords.lat.toFixed(6));
                menu.style.display = 'none';
            }));

            // Copy as lng only
            menu.appendChild(createMenuItem('Copy longitude', async () => {
                await CoordUtils.copyToClipboard(clickCoords.lng.toFixed(6));
                menu.style.display = 'none';
            }));

            // Position menu
            menu.style.display = 'block';
            menu.style.left = `${e.clientX}px`;
            menu.style.top = `${e.clientY}px`;

            // Adjust if off screen
            const menuRect = menu.getBoundingClientRect();
            if (menuRect.right > window.innerWidth) {
                menu.style.left = `${window.innerWidth - menuRect.width - 10}px`;
            }
            if (menuRect.bottom > window.innerHeight) {
                menu.style.top = `${window.innerHeight - menuRect.height - 10}px`;
            }
        });

        return menu;
    }
};

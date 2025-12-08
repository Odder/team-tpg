/**
 * Coordinate utilities - Parsing, validation, and formatting
 */

const CoordUtils = {
    STORAGE_KEY: 'tpg_target_coords',
    /**
     * Parse a coordinate input string
     * @param {string} input - Coordinate string (e.g., "40.7128, -74.0060")
     * @returns {Object|null} Parsed coordinates {lat, lng} or null if invalid
     */
    parse(input) {
        if (!input || typeof input !== 'string') {
            return null;
        }

        const parts = input.trim().split(',').map(p => p.trim());

        if (parts.length !== 2) {
            return null;
        }

        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);

        if (!this.isValid(lat, lng)) {
            return null;
        }

        return { lat, lng };
    },

    /**
     * Validate latitude and longitude values
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {boolean} True if valid
     */
    isValid(lat, lng) {
        return !isNaN(lat) &&
               !isNaN(lng) &&
               lat >= -90 &&
               lat <= 90 &&
               lng >= -180 &&
               lng <= 180;
    },

    /**
     * Format coordinates for display
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {number} precision - Decimal places (default: 4)
     * @returns {string} Formatted coordinate string
     */
    format(lat, lng, precision = 4) {
        return `${lat.toFixed(precision)}, ${lng.toFixed(precision)}`;
    },

    /**
     * Format a single coordinate value
     * @param {number} value - Coordinate value
     * @param {number} precision - Decimal places
     * @returns {string} Formatted value
     */
    formatValue(value, precision = 6) {
        return value.toFixed(precision);
    },

    /**
     * Calculate distance between two points using Haversine formula
     * @param {Object} point1 - First point {lat, lng}
     * @param {Object} point2 - Second point {lat, lng}
     * @returns {number} Distance in kilometers
     */
    distance(point1, point2) {
        const R = 6371; // Earth's radius in km
        const dLat = this._toRad(point2.lat - point1.lat);
        const dLng = this._toRad(point2.lng - point1.lng);

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this._toRad(point1.lat)) *
                  Math.cos(this._toRad(point2.lat)) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    /**
     * Format distance for display
     * @param {number} km - Distance in kilometers
     * @returns {string} Formatted distance string
     */
    formatDistance(km) {
        if (km < 1) {
            return `${Math.round(km * 1000)} m`;
        } else if (km < 10) {
            return `${km.toFixed(2)} km`;
        } else if (km < 100) {
            return `${km.toFixed(1)} km`;
        } else {
            return `${Math.round(km).toLocaleString()} km`;
        }
    },

    /**
     * Generate a Google Maps URL for a coordinate
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {string} Google Maps URL
     */
    googleMapsUrl(lat, lng) {
        return `https://www.google.com/maps?q=${lat},${lng}`;
    },

    /**
     * Get coordinates from URL hash (format: #lat,lng)
     * @returns {Object|null} Parsed coordinates or null
     */
    fromUrlHash() {
        const hash = window.location.hash.substring(1);
        return hash ? this.parse(hash) : null;
    },

    /**
     * Set URL hash from coordinates
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     */
    toUrlHash(lat, lng) {
        window.location.hash = `${lat},${lng}`;
    },

    /**
     * Convert degrees to radians
     * @private
     */
    _toRad(deg) {
        return deg * Math.PI / 180;
    },

    /**
     * Save target coordinates to localStorage
     * @param {string} coordString - Coordinate string to save
     */
    saveTarget(coordString) {
        try {
            localStorage.setItem(this.STORAGE_KEY, coordString);
        } catch (e) {
            console.warn('Could not save to localStorage:', e);
        }
    },

    /**
     * Load saved target coordinates from localStorage
     * @returns {string|null} Saved coordinate string or null
     */
    loadTarget() {
        try {
            return localStorage.getItem(this.STORAGE_KEY);
        } catch (e) {
            console.warn('Could not load from localStorage:', e);
            return null;
        }
    },

    /**
     * Copy text to clipboard
     * @param {string} text - Text to copy
     * @returns {Promise<boolean>} Success status
     */
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            console.warn('Clipboard copy failed:', e);
            return false;
        }
    }
};

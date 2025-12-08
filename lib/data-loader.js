/**
 * Data loading utilities - CSV parsing and point data handling
 */

const DataLoader = {
    /**
     * Default radius in km when not specified in CSV
     */
    DEFAULT_RADIUS_KM: 10,

    /**
     * Storage key prefix for localStorage
     */
    STORAGE_PREFIX: 'tpg_csv_',

    /**
     * Parse a CSV line into a point object
     * Supports flexible formats:
     *   - lat,lng
     *   - lat,lng,description
     *   - lat,lng,radius_km
     *   - lat,lng,radius_km,description
     *   - lat,lng,"quoted description",other,fields
     *   - # comment lines (ignored)
     *
     * Description detection: first quoted string, or first non-numeric field after lat,lng
     *
     * @param {string} line - CSV line to parse
     * @param {number} index - Line index for error reporting
     * @param {Object} options - Parsing options
     * @returns {Object|null} Parsed point {lat, lng, radius, radiusKm, title, extra} or null if invalid
     */
    parseLine(line, index = 0, options = {}) {
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (trimmed.length === 0 || trimmed.startsWith('#')) {
            return null;
        }

        // Extract all quoted strings first
        const quotedStrings = [];
        let processedLine = trimmed.replace(/"([^"]+)"/g, (match, content) => {
            quotedStrings.push(content);
            return `__QUOTED_${quotedStrings.length - 1}__`;
        });

        // Split by comma
        const parts = processedLine.split(',').map(s => s.trim()).filter(s => s);

        if (parts.length < 2) {
            console.warn(`DataLoader: Line ${index + 1} needs at least lat,lng: ${line}`);
            return null;
        }

        // Parse lat, lng (required)
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);

        if (isNaN(lat) || isNaN(lng)) {
            console.warn(`DataLoader: Invalid lat/lng on line ${index + 1}: ${line}`);
            return null;
        }

        // Validate coordinates
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            console.warn(`DataLoader: Coordinates out of range on line ${index + 1}: ${line}`);
            return null;
        }

        // Process remaining fields
        let title = null;
        let radiusKm = null;
        const extra = [];

        for (let i = 2; i < parts.length; i++) {
            const part = parts[i];

            // Check if this is a quoted string placeholder
            const quotedMatch = part.match(/^__QUOTED_(\d+)__$/);
            if (quotedMatch) {
                // First quoted string becomes title
                if (title === null) {
                    title = quotedStrings[parseInt(quotedMatch[1])];
                } else {
                    extra.push(quotedStrings[parseInt(quotedMatch[1])]);
                }
                continue;
            }

            // Try to parse as number
            const num = parseFloat(part);
            if (!isNaN(num)) {
                // First number after lat,lng could be radius
                if (radiusKm === null) {
                    radiusKm = num;
                } else {
                    extra.push(num);
                }
            } else {
                // Non-numeric, non-quoted string - could be title
                if (title === null) {
                    title = part;
                } else {
                    extra.push(part);
                }
            }
        }

        // Use default radius if none found
        if (radiusKm === null) {
            radiusKm = options.defaultRadius || this.DEFAULT_RADIUS_KM;
        }

        return {
            lat,
            lng,
            radius: radiusKm * 1000, // Convert km to meters for Leaflet
            radiusKm,
            title,
            extra: extra.length > 0 ? extra : undefined
        };
    },

    /**
     * Parse CSV text into an array of points
     * @param {string} text - CSV text content
     * @param {Object} options - Parsing options
     * @param {boolean} options.defaultTitle - Generate default titles if none provided
     * @param {number} options.defaultRadius - Default radius in km if not in CSV
     * @returns {Object[]} Array of point objects
     */
    parseCSV(text, options = {}) {
        const lines = text.split('\n');
        const points = [];

        lines.forEach((line, index) => {
            const point = this.parseLine(line, index, options);
            if (point) {
                // Add default title if requested and none provided
                if (options.defaultTitle && !point.title) {
                    point.title = `Point ${points.length + 1}`;
                }
                points.push(point);
            }
        });

        return points;
    },

    /**
     * Load points from a CSV file
     * @param {string} filename - Path to CSV file
     * @param {Object} options - Loading options
     * @returns {Promise<Object[]>} Array of point objects
     */
    async loadCSV(filename, options = {}) {
        try {
            const response = await fetch(filename);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const text = await response.text();
            const points = this.parseCSV(text, options);
            console.log(`DataLoader: Loaded ${points.length} points from ${filename}`);
            return points;
        } catch (error) {
            console.error(`DataLoader: Error loading ${filename}:`, error);
            return [];
        }
    },

    /**
     * Export points array to CSV format
     * @param {Object[]} points - Array of point objects
     * @returns {string} CSV text content
     */
    toCSV(points) {
        return points.map(point => {
            const radiusKm = point.radiusKm || (point.radius / 1000);
            const title = point.title ? `,"${point.title}"` : '';
            return `${point.lat},${point.lng},${radiusKm}${title}`;
        }).join('\n') + '\n';
    },

    /**
     * Download points as a CSV file
     * @param {Object[]} points - Array of point objects
     * @param {string} filename - Download filename
     */
    downloadCSV(points, filename = 'points.csv') {
        const csv = this.toCSV(points);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Save CSV content to localStorage
     * @param {string} key - Storage key (will be prefixed)
     * @param {string} content - CSV text content
     * @param {string} filename - Original filename for reference
     */
    saveToStorage(key, content, filename = null) {
        try {
            const data = {
                content,
                filename,
                savedAt: Date.now()
            };
            localStorage.setItem(this.STORAGE_PREFIX + key, JSON.stringify(data));
            console.log(`DataLoader: Saved ${key} to storage (${content.length} chars)`);
            return true;
        } catch (e) {
            console.warn('DataLoader: Could not save to localStorage:', e);
            return false;
        }
    },

    /**
     * Load CSV content from localStorage
     * @param {string} key - Storage key (will be prefixed)
     * @returns {Object|null} Object with content, filename, savedAt or null
     */
    loadFromStorage(key) {
        try {
            const raw = localStorage.getItem(this.STORAGE_PREFIX + key);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            console.warn('DataLoader: Could not load from localStorage:', e);
            return null;
        }
    },

    /**
     * Check if CSV exists in localStorage
     * @param {string} key - Storage key (will be prefixed)
     * @returns {boolean}
     */
    hasStored(key) {
        return localStorage.getItem(this.STORAGE_PREFIX + key) !== null;
    },

    /**
     * Clear stored CSV from localStorage
     * @param {string} key - Storage key (will be prefixed)
     */
    clearStorage(key) {
        localStorage.removeItem(this.STORAGE_PREFIX + key);
    },

    /**
     * Load points from storage or fallback to file
     * @param {string} key - Storage key
     * @param {string} fallbackFile - Fallback filename if not in storage
     * @param {Object} options - Parsing options
     * @returns {Promise<Object>} Object with points array and source info
     */
    async loadWithFallback(key, fallbackFile = null, options = {}) {
        // Try storage first
        const stored = this.loadFromStorage(key);
        if (stored) {
            const points = this.parseCSV(stored.content, options);
            console.log(`DataLoader: Loaded ${points.length} points from storage (${key})`);
            return {
                points,
                source: 'storage',
                filename: stored.filename,
                savedAt: stored.savedAt
            };
        }

        // Fallback to file
        if (fallbackFile) {
            const points = await this.loadCSV(fallbackFile, options);
            return {
                points,
                source: 'file',
                filename: fallbackFile,
                savedAt: null
            };
        }

        return {
            points: [],
            source: null,
            filename: null,
            savedAt: null
        };
    },

    /**
     * Handle file input change event - read file and save to storage
     * @param {Event} event - File input change event
     * @param {string} storageKey - Key to save under
     * @param {Function} callback - Callback with (points, filename)
     * @param {Object} options - Parsing options
     */
    handleFileInput(event, storageKey, callback, options = {}) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;

            // Save to storage
            this.saveToStorage(storageKey, content, file.name);

            // Parse and callback
            const points = this.parseCSV(content, options);
            console.log(`DataLoader: Loaded ${points.length} points from file ${file.name}`);

            if (callback) {
                callback(points, file.name);
            }
        };
        reader.readAsText(file);
    }
};

/**
 * Geodesic calculation utilities for reflection point calculations
 */

const GeoCalc = {
    /**
     * Maximum distance to consider for reflections (half Earth's circumference in km)
     */
    MAX_DISTANCE_KM: 20000,

    /**
     * Calculate reflection point where target is the midpoint between source and reflection
     * @param {Object} source - Source point {lat, lng}
     * @param {Object} target - Target point {lat, lng}
     * @returns {Object|null} Reflection point {lat, lng} or null if distance exceeds threshold
     */
    calculateReflection(source, target) {
        const sourcePoint = turf.point([source.lng, source.lat]);
        const targetPoint = turf.point([target.lng, target.lat]);

        // Calculate distance from source to target
        const distanceKm = turf.distance(sourcePoint, targetPoint, { units: 'kilometers' });

        // Check if distance exceeds maximum threshold
        if (distanceKm > this.MAX_DISTANCE_KM) {
            return null;
        }

        // Calculate bearing from source to target
        const bearing = turf.bearing(sourcePoint, targetPoint);

        // Calculate reflection point: go same distance from target in same direction
        const reflectionPoint = turf.destination(targetPoint, distanceKm, bearing, { units: 'kilometers' });

        return {
            lat: reflectionPoint.geometry.coordinates[1],
            lng: reflectionPoint.geometry.coordinates[0],
            distance: distanceKm
        };
    },

    /**
     * Calculate all reflections for a list of source points
     * @param {Array} sources - Array of source points {lat, lng, radius}
     * @param {Object} target - Target point {lat, lng}
     * @returns {Array} Array of reflection objects {lat, lng, radius, sourceIndex, distance}
     */
    calculateAllReflections(sources, target) {
        const reflections = [];

        sources.forEach((source, index) => {
            const reflection = this.calculateReflection(source, target);

            if (reflection) {
                reflections.push({
                    lat: reflection.lat,
                    lng: reflection.lng,
                    radius: source.radius, // Keep same radius as source
                    sourceIndex: index,
                    distance: reflection.distance
                });
            }
        });

        return reflections;
    },

    /**
     * Calculate distance between two points in kilometers
     * @param {Object} point1 - First point {lat, lng}
     * @param {Object} point2 - Second point {lat, lng}
     * @returns {number} Distance in kilometers
     */
    getDistance(point1, point2) {
        const p1 = turf.point([point1.lng, point1.lat]);
        const p2 = turf.point([point2.lng, point2.lat]);
        return turf.distance(p1, p2, { units: 'kilometers' });
    },

    /**
     * Find the nearest reflected area to a given point
     * @param {Object} clickPoint - Clicked point {lat, lng}
     * @param {Array} reflections - Array of reflection objects {lat, lng, radius}
     * @returns {Object|null} Nearest reflection with distance info or null
     */
    findNearestReflection(clickPoint, reflections) {
        if (!reflections || reflections.length === 0) {
            return null;
        }

        let nearest = null;
        let minDistance = Infinity;

        reflections.forEach((reflection, index) => {
            const reflectionCenter = { lat: reflection.lat, lng: reflection.lng };
            const distanceKm = this.getDistance(clickPoint, reflectionCenter);

            // Calculate distance to the edge of the circle
            const radiusKm = reflection.radius / 1000; // Convert meters to km
            const distanceToEdge = Math.max(0, distanceKm - radiusKm);

            if (distanceToEdge < minDistance) {
                minDistance = distanceToEdge;
                nearest = {
                    reflection: reflection,
                    index: index,
                    distanceToCenter: distanceKm,
                    distanceToEdge: distanceToEdge,
                    isInside: distanceKm <= radiusKm
                };
            }
        });

        return nearest;
    },

    /**
     * Format distance for display
     * @param {number} distanceKm - Distance in kilometers
     * @returns {string} Formatted distance string
     */
    formatDistance(distanceKm) {
        if (distanceKm < 1) {
            return `${Math.round(distanceKm * 1000)} m`;
        } else if (distanceKm < 10) {
            return `${distanceKm.toFixed(2)} km`;
        } else {
            return `${Math.round(distanceKm)} km`;
        }
    }
};

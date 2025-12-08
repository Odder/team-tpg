/**
 * Geodesic calculation utilities for reflection point calculations
 */

const GeoCalc = {
    /**
     * Maximum distance to consider for reflections (half Earth's circumference in km)
     */
    MAX_DISTANCE_KM: 20000,

    /**
     * Threshold for "good" reflections (quarter Earth's circumference in km)
     * Beyond this, the midpoint approaches the antipodal point
     */
    ANTIPODAL_THRESHOLD_KM: 10000,

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

        // Calculate reflection point: go TWICE the distance from source along the same great circle
        // This makes target the true geodesic midpoint between source and reflection
        const reflectionPoint = turf.destination(sourcePoint, distanceKm * 2, bearing, { units: 'kilometers' });

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
     * @returns {Array} Array of reflection objects {lat, lng, radius, sourceIndex, distance, isAntipodal}
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
                    distance: reflection.distance,
                    isAntipodal: reflection.distance > this.ANTIPODAL_THRESHOLD_KM
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
     * Find the best reflection based on midpoint distance to target
     * This correctly handles antipodal cases by optimizing for the actual score
     * @param {Object} clickPoint - Clicked point {lat, lng}
     * @param {Array} reflections - Array of reflection objects {lat, lng, radius, sourceIndex}
     * @param {Array} sources - Array of source points {lat, lng}
     * @param {Object} target - Target point {lat, lng}
     * @returns {Object|null} Best reflection with distance info or null
     */
    findNearestReflection(clickPoint, reflections, sources, target) {
        if (!reflections || reflections.length === 0) {
            return null;
        }

        let best = null;
        let bestScore = Infinity; // Best (smallest) midpoint-to-target distance

        reflections.forEach((reflection, index) => {
            // Get the source for this reflection
            const source = sources[reflection.sourceIndex];
            const sourcePoint = { lat: source.lat, lng: source.lng };

            // Calculate midpoint between click and source
            const clickTurf = turf.point([clickPoint.lng, clickPoint.lat]);
            const sourceTurf = turf.point([sourcePoint.lng, sourcePoint.lat]);
            const midpointTurf = turf.midpoint(clickTurf, sourceTurf);
            const midpoint = {
                lat: midpointTurf.geometry.coordinates[1],
                lng: midpointTurf.geometry.coordinates[0]
            };

            // Calculate score: distance from midpoint to target
            const scoreDistance = this.getDistance(midpoint, target);

            // Also calculate distance to reflection (for display purposes)
            const reflectionCenter = { lat: reflection.lat, lng: reflection.lng };
            const distanceKm = this.getDistance(clickPoint, reflectionCenter);
            const radiusKm = reflection.radius / 1000;
            const distanceToEdge = Math.max(0, distanceKm - radiusKm);

            // Pick the reflection with the best (smallest) score
            if (scoreDistance < bestScore) {
                bestScore = scoreDistance;
                best = {
                    reflection: reflection,
                    index: index,
                    distanceToCenter: distanceKm,
                    distanceToEdge: distanceToEdge,
                    isInside: distanceKm <= radiusKm,
                    scoreDistance: scoreDistance
                };
            }
        });

        return best;
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

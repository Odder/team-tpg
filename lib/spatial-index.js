/**
 * Spatial Index - Fast nearest-neighbor lookups using a k-d tree
 *
 * Provides O(log n) nearest neighbor queries for geographic points.
 * Uses Web Mercator projection internally for accurate distance comparisons.
 */

const SpatialIndex = {
    /**
     * Create a new spatial index from points
     * @param {Array} points - Array of {lat, lng, ...metadata}
     * @returns {Object} Spatial index object with query methods
     */
    create(points) {
        if (!points || points.length === 0) {
            return {
                size: 0,
                findNearest: () => null,
                findKNearest: () => []
            };
        }

        // Project points to Web Mercator for the k-d tree
        const projectedPoints = points.map((p, idx) => ({
            ...p,
            x: this._toMercatorX(p.lng),
            y: this._toMercatorY(p.lat),
            _originalIndex: idx
        }));

        // Build k-d tree
        const root = this._buildKdTree(projectedPoints, 0);

        return {
            size: points.length,
            root,

            /**
             * Find the nearest point to a query location
             * @param {number} lat - Query latitude
             * @param {number} lng - Query longitude
             * @returns {Object} Nearest point with distance in km
             */
            findNearest: (lat, lng) => {
                const qx = SpatialIndex._toMercatorX(lng);
                const qy = SpatialIndex._toMercatorY(lat);
                const result = SpatialIndex._findNearest(root, qx, qy, 0, null, Infinity);
                if (!result.point) return null;

                // Calculate actual geodesic distance
                const dist = SpatialIndex._haversineDistance(lat, lng, result.point.lat, result.point.lng);
                return { ...result.point, distance: dist };
            },

            /**
             * Find K nearest points to a query location
             * @param {number} lat - Query latitude
             * @param {number} lng - Query longitude
             * @param {number} k - Number of neighbors to find
             * @returns {Array} Array of k nearest points with distances
             */
            findKNearest: (lat, lng, k) => {
                const qx = SpatialIndex._toMercatorX(lng);
                const qy = SpatialIndex._toMercatorY(lat);
                const heap = [];
                SpatialIndex._findKNearest(root, qx, qy, 0, heap, k);

                // Convert to results with geodesic distances
                return heap
                    .map(item => ({
                        ...item.point,
                        distance: SpatialIndex._haversineDistance(lat, lng, item.point.lat, item.point.lng)
                    }))
                    .sort((a, b) => a.distance - b.distance);
            }
        };
    },

    /**
     * Web Mercator X projection
     */
    _toMercatorX(lng) {
        return lng * 20037508.34 / 180;
    },

    /**
     * Web Mercator Y projection
     */
    _toMercatorY(lat) {
        const clampedLat = Math.max(-85, Math.min(85, lat));
        let y = Math.log(Math.tan((90 + clampedLat) * Math.PI / 360)) / (Math.PI / 180);
        return y * 20037508.34 / 180;
    },

    /**
     * Haversine distance in kilometers
     */
    _haversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    /**
     * Build k-d tree recursively
     */
    _buildKdTree(points, depth) {
        if (points.length === 0) return null;
        if (points.length === 1) return { point: points[0], left: null, right: null };

        const axis = depth % 2; // 0 = x, 1 = y
        const key = axis === 0 ? 'x' : 'y';

        // Sort by current axis
        points.sort((a, b) => a[key] - b[key]);

        const mid = Math.floor(points.length / 2);

        return {
            point: points[mid],
            left: this._buildKdTree(points.slice(0, mid), depth + 1),
            right: this._buildKdTree(points.slice(mid + 1), depth + 1)
        };
    },

    /**
     * Find nearest neighbor in k-d tree
     */
    _findNearest(node, qx, qy, depth, bestPoint, bestDist) {
        if (!node) return { point: bestPoint, dist: bestDist };

        const axis = depth % 2;
        const nodeVal = axis === 0 ? node.point.x : node.point.y;
        const queryVal = axis === 0 ? qx : qy;

        // Calculate distance to this node
        const dx = node.point.x - qx;
        const dy = node.point.y - qy;
        const dist = dx * dx + dy * dy;

        if (dist < bestDist) {
            bestDist = dist;
            bestPoint = node.point;
        }

        // Determine which side to search first
        const diff = queryVal - nodeVal;
        const first = diff < 0 ? node.left : node.right;
        const second = diff < 0 ? node.right : node.left;

        // Search the closer side first
        const result1 = this._findNearest(first, qx, qy, depth + 1, bestPoint, bestDist);
        bestPoint = result1.point;
        bestDist = result1.dist;

        // Check if we need to search the other side
        if (diff * diff < bestDist) {
            const result2 = this._findNearest(second, qx, qy, depth + 1, bestPoint, bestDist);
            bestPoint = result2.point;
            bestDist = result2.dist;
        }

        return { point: bestPoint, dist: bestDist };
    },

    /**
     * Find K nearest neighbors using a max-heap
     */
    _findKNearest(node, qx, qy, depth, heap, k) {
        if (!node) return;

        const dx = node.point.x - qx;
        const dy = node.point.y - qy;
        const dist = dx * dx + dy * dy;

        // Add to heap if closer than current worst
        if (heap.length < k) {
            heap.push({ point: node.point, dist });
            heap.sort((a, b) => b.dist - a.dist); // Max-heap (worst first)
        } else if (dist < heap[0].dist) {
            heap[0] = { point: node.point, dist };
            heap.sort((a, b) => b.dist - a.dist);
        }

        const axis = depth % 2;
        const nodeVal = axis === 0 ? node.point.x : node.point.y;
        const queryVal = axis === 0 ? qx : qy;
        const diff = queryVal - nodeVal;

        const first = diff < 0 ? node.left : node.right;
        const second = diff < 0 ? node.right : node.left;

        this._findKNearest(first, qx, qy, depth + 1, heap, k);

        // Check other side if it could contain closer points
        if (heap.length < k || diff * diff < heap[0].dist) {
            this._findKNearest(second, qx, qy, depth + 1, heap, k);
        }
    }
};

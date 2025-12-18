use wasm_bindgen::prelude::*;
use std::f64::consts::PI;

const EARTH_RADIUS_KM: f64 = 6371.0;

/// Convert degrees to radians
#[inline]
fn to_rad(deg: f64) -> f64 {
    deg * PI / 180.0
}

/// Haversine distance between two points in kilometers
#[inline]
fn haversine_distance(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let lat1_rad = to_rad(lat1);
    let lat2_rad = to_rad(lat2);
    let delta_lat = to_rad(lat2 - lat1);
    let delta_lon = to_rad(lon2 - lon1);

    let a = (delta_lat / 2.0).sin().powi(2)
        + lat1_rad.cos() * lat2_rad.cos() * (delta_lon / 2.0).sin().powi(2);

    let c = 2.0 * a.sqrt().asin();

    EARTH_RADIUS_KM * c
}

/// Calculate geodesic midpoint between two points
/// Returns (lat, lon) in degrees
#[inline]
fn geodesic_midpoint(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> (f64, f64) {
    let lat1_rad = to_rad(lat1);
    let lon1_rad = to_rad(lon1);
    let lat2_rad = to_rad(lat2);
    let lon2_rad = to_rad(lon2);

    let delta_lon = lon2_rad - lon1_rad;

    let bx = lat2_rad.cos() * delta_lon.cos();
    let by = lat2_rad.cos() * delta_lon.sin();

    let lat_mid = (lat1_rad.sin() + lat2_rad.sin())
        .atan2(((lat1_rad.cos() + bx).powi(2) + by.powi(2)).sqrt());

    let lon_mid = lon1_rad + by.atan2(lat1_rad.cos() + bx);

    (lat_mid * 180.0 / PI, lon_mid * 180.0 / PI)
}

/// Result structure for a combination
#[derive(Clone, Copy)]
struct ComboResult {
    index_a: u32,
    index_b: u32,
    score: f64,
    midpoint_lat: f64,
    midpoint_lon: f64,
}

/// Calculate all combination scores and return top N results
///
/// Input arrays are flat: [lat0, lon0, lat1, lon1, ...]
/// Returns flat array: [indexA, indexB, score, midLat, midLon, ...] for top N
#[wasm_bindgen]
pub fn find_best_combinations(
    points_a: &[f64],
    points_b: &[f64],
    target_lat: f64,
    target_lon: f64,
    top_n: usize,
) -> Vec<f64> {
    let num_a = points_a.len() / 2;
    let num_b = points_b.len() / 2;

    // Pre-allocate for all combinations
    let total_combos = num_a * num_b;
    let mut results: Vec<ComboResult> = Vec::with_capacity(total_combos);

    // Calculate all combinations
    for i in 0..num_a {
        let lat_a = points_a[i * 2];
        let lon_a = points_a[i * 2 + 1];

        for j in 0..num_b {
            let lat_b = points_b[j * 2];
            let lon_b = points_b[j * 2 + 1];

            // Calculate midpoint
            let (mid_lat, mid_lon) = geodesic_midpoint(lat_a, lon_a, lat_b, lon_b);

            // Calculate score (distance from midpoint to target)
            let score = haversine_distance(mid_lat, mid_lon, target_lat, target_lon);

            results.push(ComboResult {
                index_a: i as u32,
                index_b: j as u32,
                score,
                midpoint_lat: mid_lat,
                midpoint_lon: mid_lon,
            });
        }
    }

    // Partial sort to get top N (faster than full sort for large arrays)
    let n = top_n.min(results.len());
    results.select_nth_unstable_by(n.saturating_sub(1), |a, b| {
        a.score.partial_cmp(&b.score).unwrap_or(std::cmp::Ordering::Equal)
    });

    // Sort just the top N
    results[..n].sort_by(|a, b| {
        a.score.partial_cmp(&b.score).unwrap_or(std::cmp::Ordering::Equal)
    });

    // Flatten results into output array
    let mut output = Vec::with_capacity(n * 5);
    for result in results.iter().take(n) {
        output.push(result.index_a as f64);
        output.push(result.index_b as f64);
        output.push(result.score);
        output.push(result.midpoint_lat);
        output.push(result.midpoint_lon);
    }

    output
}

/// Calculate all midpoints for heatmap generation
/// Returns flat array: [lat0, lon0, lat1, lon1, ...]
#[wasm_bindgen]
pub fn calculate_all_midpoints(
    points_a: &[f64],
    points_b: &[f64],
) -> Vec<f64> {
    let num_a = points_a.len() / 2;
    let num_b = points_b.len() / 2;

    let total_combos = num_a * num_b;
    let mut output = Vec::with_capacity(total_combos * 2);

    for i in 0..num_a {
        let lat_a = points_a[i * 2];
        let lon_a = points_a[i * 2 + 1];

        for j in 0..num_b {
            let lat_b = points_b[j * 2];
            let lon_b = points_b[j * 2 + 1];

            let (mid_lat, mid_lon) = geodesic_midpoint(lat_a, lon_a, lat_b, lon_b);

            output.push(mid_lat);
            output.push(mid_lon);
        }
    }

    output
}

/// Get the number of combinations that would be calculated
#[wasm_bindgen]
pub fn get_combination_count(num_a: usize, num_b: usize) -> usize {
    num_a * num_b
}

/// Build a distance field grid for heatmap rendering
///
/// Input: midpoints as flat array [lat0, lon0, lat1, lon1, ...]
/// Output: Float32Array of distances for the entire grid (row-major order)
///
/// Grid covers lat -85 to 85, lng -180 to 180 at given resolution
#[wasm_bindgen]
pub fn build_distance_field(
    midpoints: &[f64],
    resolution: f64,
) -> Vec<f32> {
    let lat_min: f64 = -85.0;
    let lat_max: f64 = 85.0;
    let lng_min: f64 = -180.0;
    let lng_max: f64 = 180.0;

    let lat_cells = ((lat_max - lat_min) / resolution).ceil() as usize;
    let lng_cells = ((lng_max - lng_min) / resolution).ceil() as usize;

    let num_midpoints = midpoints.len() / 2;
    let max_search_dist: f32 = 1600.0; // km

    // Build spatial index with smaller cells for faster lookup
    let cell_size: f64 = 5.0; // degrees for spatial index (larger = fewer cells to check)
    let mut spatial_index: std::collections::HashMap<(i32, i32), Vec<usize>> =
        std::collections::HashMap::new();

    for i in 0..num_midpoints {
        let lat = midpoints[i * 2];
        let lng = midpoints[i * 2 + 1];
        let cell_lat = (lat / cell_size).floor() as i32;
        let cell_lng = (lng / cell_size).floor() as i32;
        spatial_index.entry((cell_lat, cell_lng))
            .or_insert_with(Vec::new)
            .push(i);
    }

    // Pre-allocate output
    let mut field: Vec<f32> = vec![max_search_dist; lat_cells * lng_cells];

    // First pass: mark cells containing midpoints as 0
    for i in 0..num_midpoints {
        let lat = midpoints[i * 2];
        let lng = midpoints[i * 2 + 1];

        if lat < lat_min || lat > lat_max {
            continue;
        }

        let lat_idx = ((lat - lat_min) / resolution).floor() as usize;
        let lng_normalized = ((lng + 180.0) % 360.0 + 360.0) % 360.0 - 180.0;
        let lng_idx = ((lng_normalized - lng_min) / resolution).floor() as usize;

        if lat_idx < lat_cells && lng_idx < lng_cells {
            let idx = lat_idx * lng_cells + lng_idx;
            field[idx] = 0.0;
        }
    }

    // Second pass: compute distances using expanding ring search
    let km_per_cell = cell_size * 111.0; // Approximate km per spatial index cell

    for lat_idx in 0..lat_cells {
        let lat = lat_min + (lat_idx as f64 + 0.5) * resolution;
        let cos_lat = (lat.abs() * PI / 180.0).cos().max(0.1);

        for lng_idx in 0..lng_cells {
            let idx = lat_idx * lng_cells + lng_idx;

            // Skip cells that already have midpoints
            if field[idx] == 0.0 {
                continue;
            }

            let lng = lng_min + (lng_idx as f64 + 0.5) * resolution;

            let center_cell_lat = (lat / cell_size).floor() as i32;
            let center_cell_lng = (lng / cell_size).floor() as i32;

            let mut min_dist: f64 = max_search_dist as f64;

            // Expanding ring search - stop when ring's minimum possible distance > current best
            let max_ring = ((max_search_dist as f64 / km_per_cell).ceil() as i32).min(15);

            for ring in 0..=max_ring {
                // Minimum possible distance for this ring (in km)
                let ring_min_dist = if ring == 0 { 0.0 } else { (ring - 1) as f64 * km_per_cell * 0.7 };

                // If we already have a closer point, stop searching
                if ring_min_dist > min_dist {
                    break;
                }

                // Adjust longitude search for latitude
                let lng_ring = ((ring as f64 / cos_lat).ceil() as i32).min(36);

                // Search cells in this ring
                let lat_start = -ring;
                let lat_end = ring;

                for d_lat in lat_start..=lat_end {
                    let on_lat_edge = d_lat == lat_start || d_lat == lat_end;

                    let lng_start = if on_lat_edge { -lng_ring } else { -lng_ring };
                    let lng_end = if on_lat_edge { lng_ring } else { lng_ring };

                    for d_lng in lng_start..=lng_end {
                        // For inner rows, only check edge cells
                        if !on_lat_edge && d_lng != lng_start && d_lng != lng_end {
                            continue;
                        }

                        // Handle antimeridian wrapping
                        let max_lng_cells = (360.0 / cell_size).ceil() as i32;
                        let mut cell_lng = center_cell_lng + d_lng;
                        while cell_lng < -max_lng_cells / 2 {
                            cell_lng += max_lng_cells;
                        }
                        while cell_lng >= max_lng_cells / 2 {
                            cell_lng -= max_lng_cells;
                        }

                        let key = (center_cell_lat + d_lat, cell_lng);

                        if let Some(mp_indices) = spatial_index.get(&key) {
                            for &mp_idx in mp_indices {
                                let mp_lat = midpoints[mp_idx * 2];
                                let mp_lng = midpoints[mp_idx * 2 + 1];
                                let dist = haversine_distance(lat, lng, mp_lat, mp_lng);
                                if dist < min_dist {
                                    min_dist = dist;
                                }
                            }
                        }
                    }
                }
            }

            field[idx] = (min_dist as f32).min(max_search_dist);
        }
    }

    field
}

/// Get distance field dimensions for a given resolution
#[wasm_bindgen]
pub fn get_distance_field_dimensions(resolution: f64) -> Vec<usize> {
    let lat_min: f64 = -85.0;
    let lat_max: f64 = 85.0;
    let lng_min: f64 = -180.0;
    let lng_max: f64 = 180.0;

    let lat_cells = ((lat_max - lat_min) / resolution).ceil() as usize;
    let lng_cells = ((lng_max - lng_min) / resolution).ceil() as usize;

    vec![lat_cells, lng_cells]
}

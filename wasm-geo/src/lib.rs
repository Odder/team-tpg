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

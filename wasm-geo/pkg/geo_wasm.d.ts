/* tslint:disable */
/* eslint-disable */

/**
 * Calculate all midpoints for heatmap generation
 * Returns flat array: [lat0, lon0, lat1, lon1, ...]
 */
export function calculate_all_midpoints(points_a: Float64Array, points_b: Float64Array): Float64Array;

/**
 * Calculate all combination scores and return top N results
 *
 * Input arrays are flat: [lat0, lon0, lat1, lon1, ...]
 * Returns flat array: [indexA, indexB, score, midLat, midLon, ...] for top N
 */
export function find_best_combinations(points_a: Float64Array, points_b: Float64Array, target_lat: number, target_lon: number, top_n: number): Float64Array;

/**
 * Get the number of combinations that would be calculated
 */
export function get_combination_count(num_a: number, num_b: number): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly find_best_combinations: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
  readonly calculate_all_midpoints: (a: number, b: number, c: number, d: number) => [number, number];
  readonly get_combination_count: (a: number, b: number) => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

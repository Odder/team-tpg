#!/usr/bin/env node
/**
 * Build script to pre-compute all city pair midpoints
 * and save them to grid-based JSON files for fast loading.
 *
 * Usage:
 *   node build-midpoints.js          # Build both datasets
 *   node build-midpoints.js full     # Build full dataset only
 *   node build-midpoints.js top200   # Build top 200 dataset only
 */

const fs = require('fs');
const path = require('path');

const GRID_SIZE = 5; // Degrees per grid cell

const DATASETS = {
    full: {
        input: './cities.csv',
        output: './midpoint-grid',
        name: 'Full (1000+ cities)'
    },
    top200: {
        input: './cities-top200.csv',
        output: './midpoint-grid-top200',
        name: 'Top 200 cities'
    }
};

/**
 * Calculate geodesic midpoint between two points
 */
function calculateMidpoint(lat1, lng1, lat2, lng2) {
    const lat1Rad = lat1 * Math.PI / 180;
    const lng1Rad = lng1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const lng2Rad = lng2 * Math.PI / 180;

    const x1 = Math.cos(lat1Rad) * Math.cos(lng1Rad);
    const y1 = Math.cos(lat1Rad) * Math.sin(lng1Rad);
    const z1 = Math.sin(lat1Rad);

    const x2 = Math.cos(lat2Rad) * Math.cos(lng2Rad);
    const y2 = Math.cos(lat2Rad) * Math.sin(lng2Rad);
    const z2 = Math.sin(lat2Rad);

    const xMid = (x1 + x2) / 2;
    const yMid = (y1 + y2) / 2;
    const zMid = (z1 + z2) / 2;

    const lngMid = Math.atan2(yMid, xMid) * 180 / Math.PI;
    const hyp = Math.sqrt(xMid * xMid + yMid * yMid);
    const latMid = Math.atan2(zMid, hyp) * 180 / Math.PI;

    return { lat: latMid, lng: lngMid };
}

/**
 * Calculate distance between two points (Haversine formula)
 */
function getDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Get grid cell key for a coordinate
 */
function getGridKey(lat, lng) {
    const latBucket = Math.floor((lat + 90) / GRID_SIZE);
    const lngBucket = Math.floor((lng + 180) / GRID_SIZE);
    return `${latBucket}_${lngBucket}`;
}

/**
 * Parse cities from CSV
 */
function loadCities(csvPath) {
    const text = fs.readFileSync(csvPath, 'utf8');
    const cities = text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'))
        .map((line, index) => {
            const nameMatch = line.match(/"([^"]+)"/);
            const name = nameMatch ? nameMatch[1] : null;
            const dataLine = name ? line.replace(/"[^"]+"/, '').trim() : line;
            const parts = dataLine.split(',').map(s => s.trim()).filter(s => s);

            const lat = parseFloat(parts[0]);
            const lng = parseFloat(parts[1]);
            const csvName = name || parts[2] || 'Unknown';

            if (isNaN(lat) || isNaN(lng)) {
                return null;
            }

            return { name: csvName, lat, lng, index };
        })
        .filter(city => city !== null);

    return cities;
}

/**
 * Build dataset for a specific configuration
 */
function buildDataset(config) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Building: ${config.name}`);
    console.log(`Input: ${config.input}`);
    console.log(`Output: ${config.output}`);
    console.log('='.repeat(50));

    // Load cities
    console.log('\nLoading cities...');
    const cities = loadCities(config.input);
    console.log(`Loaded ${cities.length} cities`);

    // Create output directory
    if (fs.existsSync(config.output)) {
        fs.rmSync(config.output, { recursive: true });
    }
    fs.mkdirSync(config.output);

    // Save cities index
    const citiesIndex = cities.map(c => ({ n: c.name, lat: c.lat, lng: c.lng }));
    fs.writeFileSync(
        path.join(config.output, 'cities.json'),
        JSON.stringify(citiesIndex)
    );
    console.log(`Saved cities index`);

    // Compute all midpoints
    const grid = new Map();
    const totalPairs = (cities.length * (cities.length - 1)) / 2;
    let processed = 0;
    let lastPercent = 0;

    console.log(`Computing ${totalPairs.toLocaleString()} midpoints...`);

    for (let i = 0; i < cities.length; i++) {
        for (let j = i + 1; j < cities.length; j++) {
            const cityA = cities[i];
            const cityB = cities[j];

            const midpoint = calculateMidpoint(cityA.lat, cityA.lng, cityB.lat, cityB.lng);
            const dist = Math.round(getDistance(cityA.lat, cityA.lng, cityB.lat, cityB.lng));

            const gridKey = getGridKey(midpoint.lat, midpoint.lng);

            if (!grid.has(gridKey)) {
                grid.set(gridKey, []);
            }
            grid.get(gridKey).push([
                i,
                j,
                Math.round(midpoint.lat * 10000) / 10000,
                Math.round(midpoint.lng * 10000) / 10000,
                dist
            ]);

            processed++;
            const percent = Math.floor((processed / totalPairs) * 100);
            if (percent > lastPercent) {
                lastPercent = percent;
                process.stdout.write(`\r  Progress: ${percent}%`);
            }
        }
    }
    console.log('\n');

    // Save grid files
    console.log(`Saving ${grid.size} grid files...`);

    for (const [key, pairs] of grid) {
        fs.writeFileSync(
            path.join(config.output, `grid_${key}.json`),
            JSON.stringify(pairs)
        );
    }

    // Save grid index
    const gridIndex = {};
    for (const [key, pairs] of grid) {
        gridIndex[key] = pairs.length;
    }
    fs.writeFileSync(
        path.join(config.output, 'index.json'),
        JSON.stringify(gridIndex)
    );

    // Calculate total size
    let totalSize = 0;
    const files = fs.readdirSync(config.output);
    for (const file of files) {
        const stats = fs.statSync(path.join(config.output, file));
        totalSize += stats.size;
    }

    console.log(`\n--- ${config.name} Complete ---`);
    console.log(`Cities: ${cities.length}`);
    console.log(`Total pairs: ${totalPairs.toLocaleString()}`);
    console.log(`Grid cells: ${grid.size}`);
    console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

    return { cities: cities.length, pairs: totalPairs, gridCells: grid.size, sizeMB: totalSize / 1024 / 1024 };
}

/**
 * Main function
 */
function main() {
    const args = process.argv.slice(2);
    const target = args[0] || 'all';

    console.log('City Midpoint Pre-computation Tool');
    console.log('===================================\n');

    const results = {};

    if (target === 'all' || target === 'full') {
        results.full = buildDataset(DATASETS.full);
    }

    if (target === 'all' || target === 'top200') {
        results.top200 = buildDataset(DATASETS.top200);
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('BUILD COMPLETE');
    console.log('='.repeat(50));

    if (results.full) {
        console.log(`\nFull dataset: ${results.full.cities} cities, ${results.full.pairs.toLocaleString()} pairs, ${results.full.sizeMB.toFixed(2)} MB`);
    }
    if (results.top200) {
        console.log(`Top 200 dataset: ${results.top200.cities} cities, ${results.top200.pairs.toLocaleString()} pairs, ${results.top200.sizeMB.toFixed(2)} MB`);
    }
}

main();

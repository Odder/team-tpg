/**
 * Cellery List Editor
 */

// Data storage
let points = [];
let selectedPointIndex = null;
let isDragging = false;
let draggedPointIndex = null;

// Map and layers
let map = null;
let pointLayers = L.layerGroup();

/**
 * Initialize the map
 */
function initMap() {
    map = L.map('map', {
        center: [20, 0],
        zoom: 2,
        minZoom: 2,
        maxZoom: 18
    });

    // Add tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // Add layer group
    pointLayers.addTo(map);

    // Map click handler
    map.on('click', handleMapClick);
}

/**
 * Handle map click - create or select point
 */
function handleMapClick(e) {
    // Check if we clicked on an existing point
    let clickedPointIndex = null;

    points.forEach((point, index) => {
        const distance = map.distance(
            [e.latlng.lat, e.latlng.lng],
            [point.lat, point.lng]
        );

        // Check if click is within the circle's radius
        if (distance <= point.radius * 1000) {
            clickedPointIndex = index;
        }
    });

    if (clickedPointIndex !== null) {
        // Edit existing point
        selectPoint(clickedPointIndex);
        showEditor('edit', clickedPointIndex);
    } else {
        // Create new point
        const newPoint = {
            lat: e.latlng.lat,
            lng: e.latlng.lng,
            radius: 5, // Default 5km
            title: null
        };

        points.push(newPoint);
        const newIndex = points.length - 1;
        selectPoint(newIndex);
        renderPoints();
        updatePointList();
        showEditor('create', newIndex);

        // Focus on radius input for quick entry
        setTimeout(() => {
            document.getElementById('radius-input').focus();
            document.getElementById('radius-input').select();
        }, 100);
    }
}

/**
 * Show the editor form
 */
function showEditor(mode, pointIndex) {
    const form = document.getElementById('editor-form');
    const title = document.getElementById('form-title');
    const radiusInput = document.getElementById('radius-input');
    const nameInput = document.getElementById('name-input');

    selectedPointIndex = pointIndex;
    const point = points[pointIndex];

    // Set form title
    title.textContent = mode === 'create' ? 'New Point' : `Edit Point ${pointIndex + 1}`;

    // Set form values
    radiusInput.value = point.radius;
    nameInput.value = point.title || '';

    // Show form
    form.classList.add('active');

    // Auto-focus on radius input for quick editing
    setTimeout(() => {
        radiusInput.focus();
        radiusInput.select();
    }, 100);
}

/**
 * Hide the editor form
 */
function hideEditor() {
    document.getElementById('editor-form').classList.remove('active');
    selectedPointIndex = null;
    deselectAllPoints();
}

/**
 * Save the edited/created point
 */
function savePoint() {
    if (selectedPointIndex === null) return;

    const radiusInput = document.getElementById('radius-input');
    const nameInput = document.getElementById('name-input');

    const radius = parseFloat(radiusInput.value) || 5; // Default to 5km
    const name = nameInput.value.trim() || null;

    points[selectedPointIndex].radius = radius;
    points[selectedPointIndex].title = name;

    renderPoints();
    updatePointList();
    hideEditor();
}

/**
 * Delete the selected point
 */
function deletePoint() {
    if (selectedPointIndex === null) return;

    if (confirm('Delete this point?')) {
        points.splice(selectedPointIndex, 1);
        renderPoints();
        updatePointList();
        hideEditor();
    }
}

/**
 * Select a point in the list and on the map
 */
function selectPoint(index) {
    selectedPointIndex = index;

    // Update point list selection
    const items = document.querySelectorAll('.point-item');
    items.forEach((item, i) => {
        if (i === index) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });

    // Highlight on map (re-render will handle this)
    renderPoints();
}

/**
 * Deselect all points
 */
function deselectAllPoints() {
    const items = document.querySelectorAll('.point-item');
    items.forEach(item => item.classList.remove('selected'));
    selectedPointIndex = null;
    renderPoints();
}

/**
 * Render all points on the map
 */
function renderPoints() {
    pointLayers.clearLayers();

    points.forEach((point, index) => {
        const isSelected = index === selectedPointIndex;

        // Create circle
        const circle = L.circle([point.lat, point.lng], {
            radius: point.radius * 1000, // Convert km to meters
            color: isSelected ? '#f39c12' : '#3498db',
            fillColor: isSelected ? '#f39c12' : '#3498db',
            fillOpacity: isSelected ? 0.3 : 0.15,
            weight: isSelected ? 3 : 2
        });

        // Create popup
        const popupContent = `
            <strong>${point.title || `Point ${index + 1}`}</strong><br>
            Lat: ${point.lat.toFixed(6)}<br>
            Lng: ${point.lng.toFixed(6)}<br>
            Radius: ${point.radius} km
        `;
        circle.bindPopup(popupContent);

        // Click handler for selecting/editing
        circle.on('click', (e) => {
            L.DomEvent.stopPropagation(e); // Prevent map click
            selectPoint(index);
            showEditor('edit', index);
        });

        // Make circle draggable on Ctrl+Drag
        circle.on('mousedown', (e) => {
            if (e.originalEvent.ctrlKey) {
                isDragging = true;
                draggedPointIndex = index;
                map.dragging.disable();
                e.originalEvent.preventDefault();
                L.DomEvent.stopPropagation(e);
            }
        });

        circle.addTo(pointLayers);
    });
}

/**
 * Update the point list in the sidebar
 */
function updatePointList() {
    const listContainer = document.getElementById('point-list');
    const countSpan = document.getElementById('point-count');

    countSpan.textContent = points.length;

    if (points.length === 0) {
        listContainer.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px;">No points yet. Click on the map to add.</p>';
        return;
    }

    listContainer.innerHTML = '';

    points.forEach((point, index) => {
        const item = document.createElement('div');
        item.className = 'point-item';
        if (index === selectedPointIndex) {
            item.classList.add('selected');
        }

        const info = document.createElement('div');
        info.className = 'point-item-info';

        const name = document.createElement('div');
        name.className = 'point-item-name';
        name.textContent = point.title || `Point ${index + 1}`;

        const coords = document.createElement('div');
        coords.className = 'point-item-coords';
        coords.textContent = `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)} - ${point.radius}km`;

        info.appendChild(name);
        info.appendChild(coords);
        item.appendChild(info);

        // Click handler
        item.addEventListener('click', () => {
            selectPoint(index);
            showEditor('edit', index);

            // Pan map to point
            map.setView([point.lat, point.lng], Math.max(map.getZoom(), 8));
        });

        listContainer.appendChild(item);
    });
}

/**
 * Export points as cellery-list CSV
 */
function exportData() {
    if (points.length === 0) {
        alert('No points to export');
        return;
    }

    // Generate CSV content (format: lat,lng,radius,"title")
    const lines = points.map(point => {
        const title = point.title ? `,"${point.title}"` : '';
        return `${point.lat},${point.lng},${point.radius}${title}`;
    });

    const csvContent = lines.join('\n') + '\n';

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cellery-list';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Import data from file
 */
function importData(fileContent) {
    const lines = fileContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    const newPoints = [];

    lines.forEach((line, index) => {
        // Check if line has a title (contains quoted text)
        const titleMatch = line.match(/"([^"]+)"/);
        const title = titleMatch ? titleMatch[1] : null;

        // Remove title from line for easier parsing
        const dataLine = title ? line.replace(/"[^"]+"/, '').trim() : line;

        // Parse lat,lng,radius_km
        const parts = dataLine.split(',').map(s => s.trim()).filter(s => s);
        const [lat, lng, radiusKm] = parts.map(parseFloat);

        if (isNaN(lng) || isNaN(lat) || isNaN(radiusKm)) {
            console.warn(`Skipping invalid line ${index + 1}: ${line}`);
            return;
        }

        newPoints.push({
            lat: lat,
            lng: lng,
            radius: radiusKm,
            title: title
        });
    });

    if (newPoints.length > 0) {
        points = newPoints;
        renderPoints();
        updatePointList();

        // Fit map to show all points
        if (points.length > 0) {
            const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Shift+Delete: Delete selected point
        if (e.shiftKey && e.key === 'Delete' && selectedPointIndex !== null) {
            e.preventDefault();
            deletePoint();
        }

        // Escape: Cancel editor
        if (e.key === 'Escape') {
            hideEditor();
        }

        // Tab: Focus back into form if editor is open and nothing focused
        if (e.key === 'Tab' && selectedPointIndex !== null) {
            const activeElement = document.activeElement;
            const radiusInput = document.getElementById('radius-input');
            const nameInput = document.getElementById('name-input');
            const editorForm = document.getElementById('editor-form');

            // If editor is open but focus is not on form inputs
            if (editorForm.classList.contains('active') &&
                activeElement !== radiusInput &&
                activeElement !== nameInput) {
                e.preventDefault();
                radiusInput.focus();
                radiusInput.select();
            }
        }
    });
}

/**
 * Setup form input handlers for fast keyboard navigation
 */
function setupFormInputs() {
    const radiusInput = document.getElementById('radius-input');
    const nameInput = document.getElementById('name-input');

    // Auto-select on focus
    radiusInput.addEventListener('focus', () => radiusInput.select());
    nameInput.addEventListener('focus', () => nameInput.select());

    // Tab navigation
    radiusInput.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            nameInput.focus();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            nameInput.focus();
        }
    });

    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && e.shiftKey) {
            e.preventDefault();
            radiusInput.focus();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            savePoint();
        }
    });
}

/**
 * Setup mouse move and up for dragging
 */
function setupDragging() {
    map.on('mousemove', (e) => {
        if (isDragging && draggedPointIndex !== null) {
            points[draggedPointIndex].lat = e.latlng.lat;
            points[draggedPointIndex].lng = e.latlng.lng;
            renderPoints();
            updatePointList();
        }
    });

    map.on('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            draggedPointIndex = null;
            map.dragging.enable();
        }
    });

    // Also handle mouseup on document in case mouse leaves map
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            draggedPointIndex = null;
            map.dragging.enable();
        }
    });
}

/**
 * Initialize the application
 */
function init() {
    // Initialize map
    initMap();

    // Setup keyboard shortcuts
    setupKeyboardShortcuts();

    // Setup form inputs
    setupFormInputs();

    // Setup dragging
    setupDragging();

    // Upload box
    const uploadBox = document.getElementById('upload-box');
    const fileInput = document.getElementById('file-input');

    uploadBox.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                importData(event.target.result);
            };
            reader.readAsText(file);
        }
    });

    // Save button
    document.getElementById('save-btn').addEventListener('click', savePoint);

    // Cancel button
    document.getElementById('cancel-btn').addEventListener('click', hideEditor);

    // Export button
    document.getElementById('export-btn').addEventListener('click', exportData);

    // Update initial state
    updatePointList();
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

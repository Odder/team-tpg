/**
 * Navigation utilities - Consistent navigation across all pages
 */

const NavUtils = {
    /**
     * Page definitions for navigation
     */
    pages: [
        { id: 'index', href: 'index.html', label: 'Reflection', color: '#e74c3c' },
        { id: 'finder', href: 'finder.html', label: 'Finder', color: '#2ecc71' },
        { id: 'cities', href: 'cities.html', label: 'Cities', color: '#f1c40f' },
        { id: 'midpoint', href: 'midpoint.html', label: 'Midpoint', color: '#9b59b6' },
        { id: 'editor', href: 'editor.html', label: 'Editor', color: '#3498db' }
    ],

    /**
     * Render navigation into a container element
     * @param {string} containerId - DOM element ID for nav container
     * @param {string} currentPageId - ID of the current page (to highlight)
     */
    render(containerId, currentPageId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn(`NavUtils: Container #${containerId} not found`);
            return;
        }

        container.className = 'site-nav';
        container.innerHTML = this.pages.map(page => {
            const isActive = page.id === currentPageId;
            const activeClass = isActive ? 'nav-item--active' : '';
            const style = isActive ? `border-color: ${page.color}` : '';

            return `<a href="${page.href}" class="nav-item ${activeClass}" style="${style}" data-color="${page.color}">${page.label}</a>`;
        }).join('');

        // Add hover effects via JS for dynamic color
        container.querySelectorAll('.nav-item:not(.nav-item--active)').forEach(item => {
            const color = item.dataset.color;
            item.addEventListener('mouseenter', () => {
                item.style.borderColor = color;
                item.style.color = color;
            });
            item.addEventListener('mouseleave', () => {
                item.style.borderColor = 'transparent';
                item.style.color = '';
            });
        });
    },

    /**
     * Create navigation HTML string (for static insertion)
     * @param {string} currentPageId - ID of the current page
     * @returns {string} HTML string
     */
    html(currentPageId) {
        return `<nav class="site-nav" id="site-nav">` +
            this.pages.map(page => {
                const isActive = page.id === currentPageId;
                const activeClass = isActive ? 'nav-item--active' : '';
                const style = isActive ? `style="border-color: ${page.color}"` : '';
                return `<a href="${page.href}" class="nav-item ${activeClass}" ${style}>${page.label}</a>`;
            }).join('') +
            `</nav>`;
    }
};

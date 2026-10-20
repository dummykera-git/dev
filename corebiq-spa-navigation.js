/*
 * COREBIQ SPA module navigation
 * Add this script AFTER the existing index.html navigation code.
 * It preserves the existing dashboard markup and only swaps the main content
 * for an iframe when a module link is selected.
 */
(() => {
    const main = document.querySelector('main');
    const sidebarNav = document.getElementById('sidebar-nav');
    const bottomNav = document.getElementById('mobile-bottom-nav');

    if (!main || !sidebarNav || !bottomNav) {
        console.error('COREBIQ SPA: Required shell elements were not found.');
        return;
    }

    // Keep the existing dashboard markup exactly as it is.
    const dashboardContent = main.querySelector(':scope > div');
    if (!dashboardContent) {
        console.error('COREBIQ SPA: Existing dashboard content container was not found.');
        return;
    }

    const allowedPages = new Set([
        'dashboard.html',
        'crm.html',
        'accounts.html',
        'employees.html',
        'gst.html',
        'inventory.html',
        'settings.html',
        'data.html',
        'tools.html',
        'report.html',
        'notification.html',
        'users.html',
        'about-app.html',
        'templates.html',
        'biq-ai.html',
        'payment-gateway.html',
        'more.html'
    ]);

    const frame = document.createElement('iframe');
    frame.id = 'corebiq-module-frame';
    frame.title = 'COREBIQ Module';
    frame.className = 'hidden w-full border-0 bg-transparent';
    frame.style.minHeight = 'calc(100vh - 9rem)';
    frame.style.height = 'calc(100vh - 9rem)';
    frame.setAttribute('loading', 'eager');
    frame.setAttribute('allow', 'clipboard-read; clipboard-write');

    const loading = document.createElement('div');
    loading.id = 'corebiq-module-loading';
    loading.className = 'hidden py-8 text-center text-sm text-m3-onSurfaceVariant';
    loading.textContent = 'Loading module…';

    main.appendChild(loading);
    main.appendChild(frame);

    let currentPage = 'dashboard.html';
    let isLoading = false;

    function cleanPage(value) {
        if (typeof value !== 'string') return null;
        const page = value.split('?')[0].split('#')[0].split('/').pop();
        return allowedPages.has(page) ? page : null;
    }

    function setActiveNav(page) {
        sidebarNav.querySelectorAll('a[href]').forEach(link => {
            const active = cleanPage(link.getAttribute('href')) === page;
            link.classList.toggle('bg-m3-primaryContainer', active);
            link.classList.toggle('text-m3-onPrimaryContainer', active);
            link.classList.toggle('font-bold', active);
            link.setAttribute('aria-current', active ? 'page' : 'false');
        });

        bottomNav.querySelectorAll('a[href]').forEach(link => {
            const active = cleanPage(link.getAttribute('href')) === page;
            const pill = link.querySelector('div');
            const label = link.querySelector('span:last-child');
            if (pill) {
                pill.classList.toggle('bg-m3-primaryContainer', active);
                pill.classList.toggle('text-m3-onPrimaryContainer', active);
            }
            if (label) {
                label.classList.toggle('text-m3-onSurface', active);
                label.classList.toggle('font-bold', active);
            }
        });
    }

    function closeMobileSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobile-overlay');
        if (!sidebar || !overlay || !sidebar.classList.contains('-translate-x-full')) {
            if (typeof window.toggleSidebar === 'function') {
                // Only close if the drawer currently appears open.
                if (window.matchMedia('(max-width: 767px)').matches) {
                    window.toggleSidebar();
                }
            }
        }
    }

    function installFrameLinkHandler() {
        try {
            const doc = frame.contentDocument;
            if (!doc || doc.documentElement.dataset.corebiqSpaBound === '1') return;
            doc.documentElement.dataset.corebiqSpaBound = '1';

            doc.addEventListener('click', event => {
                const anchor = event.target.closest && event.target.closest('a[href]');
                if (!anchor || event.defaultPrevented ||
                    event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

                const url = new URL(anchor.href, window.location.href);
                if (url.origin !== window.location.origin) return;

                const page = cleanPage(url.pathname);
                if (!page) return;

                event.preventDefault();
                loadModule(page, true);
            });
        } catch (error) {
            // A cross-origin module cannot be inspected; it still displays in the frame.
        }
    }

    function loadModule(page, updateHistory = true) {
        const validPage = cleanPage(page);
        if (!validPage) return;

        currentPage = validPage;
        setActiveNav(validPage);
        closeMobileSidebar();

        if (validPage === 'dashboard.html') {
            frame.classList.add('hidden');
            loading.classList.add('hidden');
            dashboardContent.classList.remove('hidden');
            isLoading = false;
        } else {
            dashboardContent.classList.add('hidden');
            frame.classList.remove('hidden');
            loading.classList.remove('hidden');
            frame.classList.add('opacity-60');
            isLoading = true;

            frame.onload = () => {
                loading.classList.add('hidden');
                frame.classList.remove('opacity-60');
                isLoading = false;
                installFrameLinkHandler();

                // Keep iframe tall enough to avoid an inner scroll bar in most modules.
                try {
                    const doc = frame.contentDocument;
                    const docHeight = Math.max(
                        doc.documentElement.scrollHeight,
                        doc.body ? doc.body.scrollHeight : 0
                    );
                    frame.style.height = Math.max(docHeight, window.innerHeight - 144) + 'px';
                } catch (error) {
                    frame.style.height = 'calc(100vh - 9rem)';
                }
            };

            frame.onerror = () => {
                loading.textContent = 'Unable to load this module. Check that the HTML file exists.';
                loading.classList.remove('hidden');
                isLoading = false;
            };

            // Avoid reloading the same module when the same link is clicked again.
            const currentSrc = frame.getAttribute('src');
            if (currentSrc !== validPage) {
                frame.src = validPage;
            } else {
                loading.classList.add('hidden');
                frame.classList.remove('opacity-60');
                isLoading = false;
                installFrameLinkHandler();
            }
        }

        if (updateHistory) {
            history.pushState({ corebiqModule: validPage }, '', '#' + validPage);
        }
    }

    function handleShellClick(event) {
        const anchor = event.target.closest && event.target.closest('a[href]');
        if (!anchor || event.defaultPrevented ||
            event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

        const inSidebar = sidebarNav.contains(anchor);
        const inBottomNav = bottomNav.contains(anchor);
        if (!inSidebar && !inBottomNav) return;

        const page = cleanPage(anchor.getAttribute('href'));
        if (!page) return;

        event.preventDefault();
        loadModule(page, true);
    }

    sidebarNav.addEventListener('click', handleShellClick);
    bottomNav.addEventListener('click', handleShellClick);

    window.addEventListener('popstate', () => {
        const page = cleanPage(location.hash.slice(1)) || 'dashboard.html';
        loadModule(page, false);
    });

    // A module can request shell navigation using postMessage if needed.
    window.addEventListener('message', event => {
        if (event.origin !== window.location.origin) return;
        const data = event.data;
        if (!data || data.type !== 'corebiq:navigate') return;
        const page = cleanPage(data.page);
        if (page) loadModule(page, true);
    });

    const initialPage = cleanPage(location.hash.slice(1)) || 'dashboard.html';
    loadModule(initialPage, false);
})();

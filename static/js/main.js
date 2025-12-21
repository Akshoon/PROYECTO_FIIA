// main.js - Music Events Graph Visualization with Complete Parameter Loading

(function () {
    'use strict';

    // State
    let sigma = null;
    let currentGraph = null;
    let allEvents = [];
    let graphData = { nodes: [], links: [] };
    let filterParams = null; // Store all filter parameters
    let worker = null;
    let db = null;
    let initialized = false;

    const MIN_YEAR = 1945;
    const MAX_YEAR = 1995;

    // DOM Elements
    let elements = {};

    // ==================== INITIALIZATION ====================

    window.initializeGraph = initializeGraph;

    // La inicialización se maneja con initPromise (ver más abajo)

    // ==================== ESCUCHAR FILTROS DESDE TABLE VIEW ====================
    // Verificar si hay filtros guardados en sessionStorage desde table-view.js
    function checkForTableFilters() {
        const graphFilters = sessionStorage.getItem('graphFiltersFromTable');
        if (graphFilters) {
            try {
                const filters = JSON.parse(graphFilters);
                console.log('📊 Filtros recibidos de table-view:', filters);

                // Limpiar sessionStorage primero
                sessionStorage.removeItem('graphFiltersFromTable');

                // Si no hay datos del grafo, no podemos filtrar
                if (!graphData.nodes || graphData.nodes.length === 0) {
                    console.log('No graph data available yet, will load first...');
                    return true; // Indica que hay filtros pero necesitamos cargar datos primero
                }

                // Primero asegurarse de que el grafo está renderizado
                if (!sigma) {
                    console.log('Rendering graph before applying filters...');
                    renderGraph(graphData.nodes, graphData.links);
                }

                // Determinar qué valor buscar según el tipo de filtro
                let searchValue = '';
                if (filters.tab === 'events' && filters.event) {
                    searchValue = filters.event;
                    if (elements.eventSearch) elements.eventSearch.value = filters.event;
                } else if (filters.tab === 'participants' && filters.participant) {
                    searchValue = filters.participant;
                    if (elements.participantSearch) elements.participantSearch.value = filters.participant;
                } else if (filters.tab === 'composers' && filters.composer) {
                    searchValue = filters.composer;
                    if (elements.composerSearch) elements.composerSearch.value = filters.composer;
                } else if (filters.tab === 'cities' && filters.city) {
                    searchValue = filters.city;
                    if (elements.locationSearch) elements.locationSearch.value = filters.city;
                } else if (filters.tab === 'locations' && filters.location) {
                    searchValue = filters.location;
                    if (elements.locationSearch) elements.locationSearch.value = filters.location;
                }

                // Buscar y resaltar el nodo en el grafo
                if (searchValue && currentGraph && sigma) {
                    console.log('🔍 Buscando nodo:', searchValue);
                    setTimeout(() => {
                        searchAndHighlightNode(searchValue);
                    }, 500);
                }

                return true;
            } catch (e) {
                console.error('Error parsing table filters:', e);
                sessionStorage.removeItem('graphFiltersFromTable');
            }
        }
        return false;
    }

    // Función para buscar y mostrar solo un nodo con sus conexiones
    function searchAndHighlightNode(searchTerm) {
        if (!graphData.nodes || graphData.nodes.length === 0) {
            console.log('No graph data available for search');
            return;
        }

        // Limpiar término de búsqueda (quitar duplicados como "Nombre - Nombre")
        let cleanSearchTerm = searchTerm;
        if (searchTerm.includes(' - ')) {
            const parts = searchTerm.split(' - ');
            if (parts.length === 2 && parts[0].trim().toLowerCase() === parts[1].trim().toLowerCase()) {
                cleanSearchTerm = parts[0].trim();
            }
        }

        const searchLower = cleanSearchTerm.toLowerCase();
        console.log(`🔍 Buscando: "${cleanSearchTerm}" (original: "${searchTerm}")`);

        let foundNode = null;

        // Buscar el nodo que coincida en los datos originales
        for (const node of graphData.nodes) {
            if (node.label && node.label.toLowerCase().includes(searchLower)) {
                foundNode = node;
                break;
            }
        }

        if (foundNode) {
            console.log('✅ Nodo encontrado:', foundNode.label);

            // Crear subgrafo con el nodo y sus vecinos
            const neighborNodes = new Set();
            const neighborLinks = [];

            neighborNodes.add(foundNode.id);

            // Encontrar todos los enlaces conectados al nodo
            for (const link of graphData.links) {
                const source = String(link.source);
                const target = String(link.target);

                if (source === foundNode.id || target === foundNode.id) {
                    neighborLinks.push(link);
                    neighborNodes.add(source);
                    neighborNodes.add(target);
                }
            }

            // Filtrar los nodos que son vecinos
            const filteredNodes = graphData.nodes.filter(node => neighborNodes.has(node.id));

            console.log(`📊 Mostrando subgrafo: ${filteredNodes.length} nodos, ${neighborLinks.length} enlaces`);

            // Marcar el nodo principal para resaltarlo
            const nodesWithHighlight = filteredNodes.map(node => {
                if (node.id === foundNode.id) {
                    return {
                        ...node,
                        size: 25,
                        highlighted: true,
                        originalColor: node.color
                    };
                }
                return { ...node, size: 10 };
            });

            // Renderizar el subgrafo
            renderGraph(nodesWithHighlight, neighborLinks);

            // Después de renderizar, resaltar el nodo principal
            setTimeout(() => {
                if (currentGraph && currentGraph.hasNode(foundNode.id)) {
                    currentGraph.setNodeAttribute(foundNode.id, 'color', '#FFD700');
                    currentGraph.setNodeAttribute(foundNode.id, 'size', 30);

                    // Centrar la cámara en el nodo
                    if (sigma) {
                        const nodePosition = sigma.getNodeDisplayData(foundNode.id);
                        if (nodePosition) {
                            sigma.getCamera().animate(
                                { x: nodePosition.x, y: nodePosition.y, ratio: 0.3 },
                                { duration: 500 }
                            );
                        }
                        sigma.refresh();
                    }
                }
            }, 1000);

            // Actualizar el input de búsqueda del grafo
            if (elements.graphSearchInput) {
                elements.graphSearchInput.value = searchTerm;
            }

            showNotification(`✅ Mostrando "${foundNode.label}" con ${filteredNodes.length - 1} conexiones`, 3000);
        } else {
            console.log('⚠️ Nodo no encontrado para:', searchTerm);
            showNotification(`⚠️ No se encontró "${searchTerm}" en el grafo.`, 4000);
        }
    }

    // Variable para indicar si la app está lista
    let appReady = false;
    let initPromise = null;

    async function init() {
        console.log('Initializing application...');

        // Cache DOM elements
        cacheElements();

        // Initialize worker
        initWorker();

        // Initialize database and load cached data
        await initDB();

        // Setup UI
        populateYearSelect();
        setupEventListeners();
        setupZoomControls();
        setupSearchFunctionality();

        // Load filter parameters
        await loadFilterParameters();

        // Marcar que la app está lista
        appReady = true;
        console.log('Application initialized', {
            hasNodes: graphData.nodes?.length || 0,
            hasEvents: allEvents?.length || 0
        });

        // Si hay filtros pendientes de la tabla, procesarlos ahora
        const pendingFilters = sessionStorage.getItem('graphFiltersFromTable');
        if (pendingFilters && graphData.nodes && graphData.nodes.length > 0) {
            console.log('📊 Processing pending table filters...');
            // Renderizar el grafo primero
            renderGraph(graphData.nodes, graphData.links);
            // Luego aplicar los filtros
            setTimeout(() => {
                checkForTableFilters();
            }, 500);
        }
    }

    // Crear promesa de inicialización
    initPromise = new Promise((resolve) => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', async () => {
                await init();
                resolve();
            });
        } else {
            init().then(resolve);
        }
    });

    function cacheElements() {
        elements = {
            sigmaContainer: document.getElementById('sigma-container'),
            loadingOverlay: document.getElementById('loading-overlay'),
            yearSelect: document.getElementById('year-select'),
            composerSearch: document.getElementById('composer-search'),
            participantSearch: document.getElementById('participant-search'),
            pieceSearch: document.getElementById('piece-search'),
            eventSearch: document.getElementById('event-search'),
            locationSearch: document.getElementById('location-search'),
            activitySearch: document.getElementById('activity-search'),
            genderSelect: document.getElementById('gender-select'),
            limitSelect: document.getElementById('limit-select'),
            loadBtn: document.getElementById('load-btn'),
            monthlyBtn: document.getElementById('monthly-btn'),
            clearBtn: document.getElementById('clear-btn'),
            clearCacheBtn: document.getElementById('clear-cache-btn'),
            graphSearchInput: document.getElementById('graph-search-input')
        };
    }

    function initWorker() {
        try {
            worker = new Worker('/static/js/worker.js');
            worker.onmessage = handleWorkerMessage;
            worker.onerror = (e) => console.error('Worker error:', e);
            console.log('Worker initialized');
        } catch (err) {
            console.error('Failed to init worker:', err);
        }
    }

    async function initDB() {
        try {
            // Check if MusicEventsDB is available
            if (!window.MusicEventsDB) {
                console.error('MusicEventsDB not loaded yet');
                // Try to wait a bit and retry
                await new Promise(resolve => setTimeout(resolve, 100));
                if (!window.MusicEventsDB) {
                    throw new Error('MusicEventsDB is not available');
                }
            }

            db = window.MusicEventsDB;
            await db.init();
            console.log('Database initialized');

            // Try to load cached data
            const cached = await db.getGraphData();
            if (cached.nodes && cached.nodes.length > 0) {
                graphData = cached;
                console.log('✓ Loaded cached graph data:', cached.nodes.length, 'nodes');
            }

            // Try to load cached events
            const cachedEvents = await db.getAllEvents();
            if (cachedEvents && cachedEvents.length > 0) {
                allEvents = cachedEvents;
                console.log('✓ Loaded cached events: ' + cachedEvents.length + ' events');
            }

            // Try to load cached filter params
            const cachedParams = await db.getAllFilterParams();
            if (cachedParams && Object.keys(cachedParams).some(k => cachedParams[k].length > 0)) {
                filterParams = cachedParams;
                console.log('✓ Loaded cached filter params');
                populateFilterDropdowns();
            }

            // Check if we need to refresh data
            const lastUpdate = await db.getLastUpdate();
            if (lastUpdate) {
                const ageInDays = (Date.now() - lastUpdate) / (1000 * 60 * 60 * 24);
                let ageText;
                if (ageInDays < 1) {
                    ageText = Math.floor(ageInDays * 24) + ' horas';
                } else {
                    ageText = Math.floor(ageInDays) + ' días';
                }
                console.log('Datos del caché tienen ' + ageText + ' de antigüedad');

                const isStale = await db.isDataStale(30);
                if (isStale) {
                    console.log('⚠ Cached data is stale (>30 days), consider refreshing');
                }

                // Update cache status display
                updateCacheStatus(lastUpdate, isStale);
            } else {
                console.log('No cached data found');
                updateCacheStatus(null, false);
            }
        } catch (err) {
            console.error('Database error:', err);
            // Continue without database support
            console.warn('Continuing without IndexedDB support');
        }
    }

    function updateCacheStatus(lastUpdate, isStale) {
        const statusEl = document.getElementById('cache-status');
        if (!statusEl) return;

        if (!lastUpdate) {
            statusEl.style.display = 'none';
            return;
        }

        const ageInDays = (Date.now() - lastUpdate) / (1000 * 60 * 60 * 24);
        let ageText;
        if (ageInDays < 1) {
            ageText = Math.floor(ageInDays * 24) + ' horas';
        } else {
            ageText = Math.floor(ageInDays) + ' días';
        }

        const date = new Date(lastUpdate).toLocaleDateString('es-CL', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        if (isStale) {
            const btnHtml = '<button onclick="window.handleMonthlyClickGlobal()" style="background: #ff9800; border: none; padding: 5px 10px; margin-left: 10px; border-radius: 3px; cursor: pointer; color: white;">Actualizar Ahora</button>';
            statusEl.innerHTML = '⚠ Datos en caché de hace ' + ageText + ' (' + date + '). ' + btnHtml;
            statusEl.style.color = '#ff9800';
        } else {
            statusEl.innerHTML = '✓ Datos cargados desde caché local (actualizado ' + ageText + ' atrás - ' + date + ')';
            statusEl.style.color = '#4CAF50';
        }

        statusEl.style.display = 'block';
    }

    async function loadFilterParameters() {
        console.log('Loading filter parameters...');
        showLoading(true, 'Cargando parámetros de filtro...');

        try {
            // Check if db is available
            if (!db) {
                console.warn('Database not available, skipping filter parameter cache');
                await fetchFilterParamsFromAPI();
                showLoading(false);
                return;
            }

            // Try to get from cache first
            const cachedParams = await db.getAllFilterParams();

            if (cachedParams && Object.keys(cachedParams).some(k => cachedParams[k].length > 0)) {
                filterParams = cachedParams;
                console.log('Loaded filter params from cache');
                populateFilterDropdowns();
                showLoading(false);
                return;
            }

            // If not in cache, fetch from API
            await fetchFilterParamsFromAPI();
            showLoading(false);
        } catch (err) {
            console.error('Error loading filter parameters:', err);
            showLoading(false);
        }
    }

    async function fetchFilterParamsFromAPI() {
        console.log('Fetching filter parameters from API...');

        try {
            const response = await fetch('/api/get_all_filter_values');

            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }

            const data = await response.json();

            if (data.success && data.data) {
                filterParams = data.data;
                console.log('Filter parameters loaded:', data.counts);

                // Store in IndexedDB for future use (if available)
                if (db && db.db) {
                    try {
                        await db.storeFilterParams(filterParams);
                    } catch (storeErr) {
                        console.warn('Could not store filter params:', storeErr);
                    }
                }

                populateFilterDropdowns();
            } else {
                console.warn('Failed to load filter parameters');
            }
        } catch (err) {
            console.error('Error fetching from API:', err);
        }
    }

    function populateFilterDropdowns() {
        if (!filterParams) return;

        // You can add autocomplete or datalists here
        // For now, we'll add datalists for text inputs

        // Add datalist for composers
        if (filterParams.composers && filterParams.composers.length > 0) {
            addDatalist('composer-list', filterParams.composers, elements.composerSearch);
        }

        // Add datalist for participants
        if (filterParams.participants && filterParams.participants.length > 0) {
            addDatalist('participant-list', filterParams.participants, elements.participantSearch);
        }

        // Add datalist for cities
        if (filterParams.cities && filterParams.cities.length > 0) {
            addDatalist('location-list', filterParams.cities, elements.locationSearch);
        }

        // Add datalist for instruments/activities
        if (filterParams.instruments && filterParams.instruments.length > 0) {
            addDatalist('activity-list', filterParams.instruments, elements.activitySearch);
        }

        console.log('Filter dropdowns populated');
    }

    function addDatalist(id, items, inputElement) {
        if (!inputElement) return;

        // Remove existing datalist if any
        let datalist = document.getElementById(id);
        if (datalist) {
            datalist.remove();
        }

        // Create new datalist
        datalist = document.createElement('datalist');
        datalist.id = id;

        // Add options (limit to first 100 for performance)
        const maxItems = Math.min(items.length, 100);
        for (let i = 0; i < maxItems; i++) {
            const option = document.createElement('option');
            option.value = items[i].name;
            datalist.appendChild(option);
        }

        document.body.appendChild(datalist);
        inputElement.setAttribute('list', id);
    }

    async function initializeGraph() {
        console.log('Initializing graph... waiting for app to be ready');

        // Esperar a que la app esté lista (datos cargados de IndexedDB)
        if (initPromise) {
            await initPromise;
        }

        console.log('App ready, initializing graph...', {
            initialized,
            hasNodes: graphData.nodes?.length || 0,
            hasEvents: allEvents?.length || 0,
            appReady
        });

        // Si ya está inicializado pero hay datos, solo renderizar
        if (initialized && graphData.nodes && graphData.nodes.length > 0) {
            console.log('Graph already initialized, rendering and checking for table filters...');
            renderGraph(graphData.nodes, graphData.links);
            setTimeout(() => checkForTableFilters(), 300);
            return;
        }

        initialized = true;

        // Check if we have cached graph data (nodes)
        if (graphData.nodes && graphData.nodes.length > 0) {
            console.log('Using cached graph data:', graphData.nodes.length, 'nodes');
            renderGraph(graphData.nodes, graphData.links);
            showMessage('✓ Datos cargados desde caché local. Use "Cargar Todo" para actualizar.');

            // Verificar si hay filtros desde table-view
            setTimeout(() => {
                checkForTableFilters();
            }, 500);
        } else if (allEvents && allEvents.length > 0) {
            // Tenemos eventos pero no nodos, procesar eventos para crear el grafo
            console.log('No cached nodes, but have events. Processing events...');
            processEventsWithWorker(allEvents, {});

            // Verificar filtros después de procesar
            setTimeout(() => {
                checkForTableFilters();
            }, 1000);
        } else {
            // No cached data, check if table filters want to load data
            const hasTableFilters = sessionStorage.getItem('graphFiltersFromTable');
            if (hasTableFilters) {
                console.log('Filters from table detected, loading data...');
                showMessage('📥 Cargando datos para mostrar el elemento seleccionado...');
                handleMonthlyClick();
            } else {
                showMessage('👋 Bienvenido! Haga clic en "Cargar Todo" para comenzar a explorar los datos.');
            }
        }
    }

    // ==================== DATA LOADING ====================

    async function loadInitialData() {
        showLoading(true, 'Cargando datos iniciales...');

        try {
            const response = await fetch('/api/monthly_ingestion');
            if (!response.ok) throw new Error('HTTP ' + response.status);

            const data = await response.json();
            console.log('Loaded data:', {
                events: data.events ? data.events.length : 0,
                nodes: data.nodes ? data.nodes.length : 0,
                links: data.links ? data.links.length : 0
            });

            if (data.nodes && data.nodes.length > 0) {
                graphData = { nodes: data.nodes, links: data.links || [] };
                allEvents = data.events || [];

                // Store everything in IndexedDB
                if (db) await db.storeAllData(data);

                // Also update filter params if included
                if (data.params) {
                    filterParams = data.params;
                    populateFilterDropdowns();
                }

                renderGraph(graphData.nodes, graphData.links);
            } else if (data.events && data.events.length > 0) {
                allEvents = data.events;
                // Process all events, no limit
                processEventsWithWorker(allEvents, {});
            } else {
                showMessage('No hay datos disponibles. Intente "Cargar Todo".');
            }
        } catch (err) {
            console.error('Error loading data:', err);
            showMessage('Error cargando datos. Haga clic en "Cargar Todo" para reintentar.');
        }
    }

    // ==================== EVENT HANDLERS ====================

    function setupEventListeners() {
        if (elements.loadBtn) {
            elements.loadBtn.addEventListener('click', handleLoadClick);
        }
        if (elements.monthlyBtn) {
            elements.monthlyBtn.addEventListener('click', handleMonthlyClick);
        }
        if (elements.clearBtn) {
            elements.clearBtn.addEventListener('click', handleClearClick);
        }
        if (elements.clearCacheBtn) {
            elements.clearCacheBtn.addEventListener('click', handleClearCacheClick);
        }
    }

    function handleLoadClick() {
        const filters = getFilters();
        console.log('Load clicked with filters:', filters);

        if (graphData.nodes && graphData.nodes.length > 0) {
            filterGraphData(filters);
        } else if (allEvents.length > 0) {
            processEventsWithWorker(allEvents, filters);
        } else {
            showMessage('No hay datos. Use "Cargar Todo" primero.');
        }
    }

    async function handleMonthlyClick() {
        showLoading(true, 'Cargando todos los datos desde la API...');

        try {
            const response = await fetch('/api/monthly_ingestion');
            if (!response.ok) throw new Error('HTTP ' + response.status);

            const data = await response.json();

            if (data.error) {
                showMessage('Error: ' + data.error);
                return;
            }

            console.log('Monthly data received:', {
                events: data.events ? data.events.length : 0,
                nodes: data.nodes ? data.nodes.length : 0,
                links: data.links ? data.links.length : 0,
                params: data.params ? Object.keys(data.params).length : 0
            });

            allEvents = data.events || [];

            if (data.nodes && data.nodes.length > 0) {
                graphData = { nodes: data.nodes, links: data.links || [] };

                // Store ALL data in IndexedDB (events, nodes, links, params)
                if (db) {
                    showLoading(true, 'Guardando ' + allEvents.length + ' eventos localmente...');
                    try {
                        await db.storeAllData(data);
                        console.log('✓ All data saved to IndexedDB');

                        // Update cache status
                        const lastUpdate = await db.getLastUpdate();
                        updateCacheStatus(lastUpdate, false);

                        // Get and show storage stats
                        const stats = await db.getStats();
                        if (stats) {
                            console.log('📊 Storage Stats:', stats);
                            const msg = '✓ Datos guardados localmente<br><br>' +
                                '📦 ' + stats.events + ' eventos<br>' +
                                '🎵 ' + stats.nodes + ' nodos<br>' +
                                '🔗 ' + stats.links + ' enlaces<br>' +
                                '👤 ' + stats.composers + ' compositores<br>' +
                                '🏙️ ' + stats.cities + ' ciudades<br>' +
                                '🎹 ' + stats.instruments + ' instrumentos<br><br>' +
                                '💾 Tamaño aproximado: ' + stats.estimatedSizeMB + ' MB<br><br>' +
                                '<small>La próxima vez cargarán instantáneamente.</small>';
                            showMessage(msg);
                        } else {
                            showMessage('✓ Datos guardados localmente. La próxima vez cargarán instantáneamente.');
                        }

                        // Small delay to show the message
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    } catch (err) {
                        console.error('Error saving to IndexedDB:', err);
                        showMessage('⚠ Datos cargados pero no se pudieron guardar localmente.');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }

                // Update filter params if included
                if (data.params) {
                    filterParams = data.params;
                    populateFilterDropdowns();
                    console.log('✓ Filter parameters updated');
                }

                renderGraph(graphData.nodes, graphData.links);
            } else if (allEvents.length > 0) {
                // Process all events, no default limit
                processEventsWithWorker(allEvents, {});
            } else {
                showMessage('No se recibieron datos del servidor.');
            }

            console.log('Monthly data loaded:', allEvents.length, 'events');
        } catch (err) {
            console.error('Error loading monthly data:', err);
            showMessage('Error cargando datos. Verifique la conexión.');
        }
    }

    // Make handleMonthlyClick available globally for cache status button
    window.handleMonthlyClickGlobal = handleMonthlyClick;

    function handleClearClick() {
        if (elements.yearSelect) elements.yearSelect.value = '';
        if (elements.composerSearch) elements.composerSearch.value = '';
        if (elements.participantSearch) elements.participantSearch.value = '';
        if (elements.pieceSearch) elements.pieceSearch.value = '';
        if (elements.eventSearch) elements.eventSearch.value = '';
        if (elements.locationSearch) elements.locationSearch.value = '';
        if (elements.activitySearch) elements.activitySearch.value = '';
        if (elements.genderSelect) elements.genderSelect.value = '';
        if (elements.limitSelect) elements.limitSelect.value = '500';

        if (graphData.nodes && graphData.nodes.length > 0) {
            renderGraph(graphData.nodes, graphData.links);
        }
    }

    async function handleClearCacheClick() {
        if (!confirm('¿Está seguro de que desea limpiar la caché local? Esto eliminará todos los datos almacenados.')) {
            return;
        }

        showLoading(true, 'Limpiando caché...');

        try {
            // Limpiar IndexedDB
            if (db && db.db) {
                await db.clearAll();
                console.log('✓ IndexedDB limpiada');
            }

            // Limpiar caché del servidor
            try {
                await fetch('/api/clear_cache', { method: 'POST' });
                console.log('✓ Caché del servidor limpiada');
            } catch (e) {
                console.warn('No se pudo limpiar caché del servidor:', e);
            }

            // Resetear estado local
            graphData = { nodes: [], links: [] };
            allEvents = [];
            filterParams = null;

            showMessage('✓ Caché limpiada. Haga clic en "Cargar Todo" para recargar los datos.');
        } catch (err) {
            console.error('Error limpiando caché:', err);
            showMessage('Error al limpiar caché: ' + err.message);
        }
    }

    function getFilters() {
        return {
            year: (elements.yearSelect && elements.yearSelect.value) || '',
            composer_q: (elements.composerSearch && elements.composerSearch.value && elements.composerSearch.value.trim()) || '',
            participant_q: (elements.participantSearch && elements.participantSearch.value && elements.participantSearch.value.trim()) || '',
            piece_q: (elements.pieceSearch && elements.pieceSearch.value && elements.pieceSearch.value.trim()) || '',
            name_q: (elements.eventSearch && elements.eventSearch.value && elements.eventSearch.value.trim()) || '',
            location_q: (elements.locationSearch && elements.locationSearch.value && elements.locationSearch.value.trim()) || '',
            activity_q: (elements.activitySearch && elements.activitySearch.value && elements.activitySearch.value.trim()) || '',
            gender_q: (elements.genderSelect && elements.genderSelect.value) || '',
            limit: parseInt((elements.limitSelect && elements.limitSelect.value) || '500') || 500
        };
    }

    // ==================== WORKER COMMUNICATION ====================

    function processEventsWithWorker(events, filters) {
        if (!worker) {
            showMessage('Worker no disponible');
            return;
        }
        showLoading(true, 'Procesando eventos...');
        worker.postMessage({ events, filters });
    }

    function filterGraphData(filters) {
        if (!worker) {
            showMessage('Worker no disponible');
            return;
        }

        filters = filters || {};

        const hasFilters = filters.year || filters.composer_q || filters.participant_q ||
            filters.piece_q || filters.name_q || filters.location_q ||
            filters.activity_q || filters.gender_q;

        if (!hasFilters) {
            renderGraph(graphData.nodes, graphData.links);
            return;
        }

        showLoading(true, 'Filtrando datos...');
        worker.postMessage({ nodes: graphData.nodes, links: graphData.links, filters });
    }

    async function handleWorkerMessage(e) {
        const { nodes, links, error } = e.data;

        if (error) {
            console.error('Worker error:', error);
            showMessage('Error procesando datos: ' + error);
            return;
        }

        if (nodes && nodes.length > 0) {
            if (!graphData.nodes || graphData.nodes.length === 0) {
                graphData = { nodes, links: links || [] };
                if (db) {
                    try {
                        await db.storeGraphData(nodes, links || []);
                    } catch (err) {
                        console.error('Cache error:', err);
                    }
                }
            }
            renderGraph(nodes, links || []);
        } else {
            showMessage('No se encontraron resultados con esos filtros.');
        }
    }

    // ==================== RENDERING ====================

    function showLoading(show, message) {
        if (!message) {
            message = 'Cargando datos...';
        }
        if (elements.loadingOverlay) {
            elements.loadingOverlay.style.display = show ? 'flex' : 'none';
            const textEl = elements.loadingOverlay.querySelector('span');
            if (textEl) textEl.innerHTML = message;
        }
    }

    function showMessage(msg) {
        showLoading(false);
        // Solo mostrar mensaje si NO hay grafo renderizado
        if (sigma) {
            // Si hay grafo, usar notificación en su lugar
            showNotification(msg);
            return;
        }
        if (elements.sigmaContainer) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message-display';
            messageDiv.style.cssText = 'display: flex; align-items: center; justify-content: center; height: 100%; text-align: center; font-size: 16px; line-height: 1.8; color: #e0e0e0; padding: 40px;';

            const innerDiv = document.createElement('div');
            innerDiv.style.maxWidth = '600px';
            innerDiv.innerHTML = msg;

            messageDiv.appendChild(innerDiv);
            elements.sigmaContainer.innerHTML = '';
            elements.sigmaContainer.appendChild(messageDiv);
        }
    }

    // Mostrar notificación temporal sin destruir el grafo
    function showNotification(msg, duration = 4000) {
        // Remover notificación anterior si existe
        const existingNotif = document.getElementById('graph-notification');
        if (existingNotif) {
            existingNotif.remove();
        }

        const notif = document.createElement('div');
        notif.id = 'graph-notification';
        notif.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.85);
            color: #ffffff;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            transition: opacity 0.3s ease;
            max-width: 80%;
            text-align: center;
        `;
        notif.innerHTML = msg;

        document.body.appendChild(notif);

        // Auto-remover después del tiempo especificado
        setTimeout(() => {
            notif.style.opacity = '0';
            setTimeout(() => notif.remove(), 300);
        }, duration);
    }

    function renderGraph(nodes, links) {
        showLoading(false);

        if (!nodes || nodes.length === 0) {
            showMessage('No hay nodos para mostrar');
            return;
        }

        if (!elements.sigmaContainer) {
            console.error('Sigma container not found');
            return;
        }

        // Validate and prepare nodes
        const nodeMap = new Map();
        const validNodes = [];

        for (const node of nodes) {
            if (!node.id || nodeMap.has(node.id)) continue;

            nodeMap.set(node.id, true);
            validNodes.push({
                id: String(node.id),
                label: String(node.label || ''),
                type: node.type || 'unknown',
                x: typeof node.x === 'number' ? node.x : Math.random() * 100,
                y: typeof node.y === 'number' ? node.y : Math.random() * 100,
                size: node.size || 8
            });
        }

        if (validNodes.length === 0) {
            showMessage('No hay nodos válidos');
            return;
        }

        // Validate links
        const validLinks = (links || []).filter(link =>
            link &&
            link.source &&
            link.target &&
            nodeMap.has(String(link.source)) &&
            nodeMap.has(String(link.target)) &&
            String(link.source) !== String(link.target)
        );

        console.log('Rendering:', validNodes.length, 'nodes,', validLinks.length, 'links');

        // Destroy previous sigma
        if (sigma) {
            sigma.kill();
            sigma = null;
        }

        elements.sigmaContainer.innerHTML = '';

        if (validLinks.length === 0) {
            showMessage('No hay conexiones para mostrar. Intente con diferentes filtros.');
            return;
        }

        try {
            const Graph = window.graphology.Graph || window.graphology;
            currentGraph = new Graph({ multi: true, allowSelfLoops: false });

            // Add nodes - LIMPIO, sin marcas
            for (const node of validNodes) {
                currentGraph.addNode(node.id, {
                    label: node.label,
                    size: node.size,
                    color: getNodeColor(node.type),
                    nodeType: node.type,
                    hidden: false,
                    highlighted: false,  // ✅ NUEVO: Asegurar que NO está marcado
                    selected: false      // ✅ NUEVO: Asegurar que NO está seleccionado
                });
            }


            // Add edges
            for (const link of validLinks) {
                try {
                    currentGraph.addEdge(String(link.source), String(link.target), {
                        label: link.label || '',
                        size: 0.5,
                        color: '#404040'
                    });
                } catch (err) {
                    // Skip duplicate edges
                }
            }

            // Apply layout
            console.log('Applying layout...');
            applyLayout(currentGraph);

            // Initialize Sigma
            sigma = new Sigma(currentGraph, elements.sigmaContainer, {
                renderLabels: true,
                labelRenderedSizeThreshold: 8,
                labelFont: 'Inter, Arial, sans-serif',
                labelSize: 11,
                labelWeight: '500',
                labelColor: { color: '#e7e9ea' },  // Labels blancos por defecto
                minCameraRatio: 0.1,
                maxCameraRatio: 10,
                defaultNodeColor: '#999',
                defaultEdgeColor: '#404040',

                // NUEVO: Control dinámico de colores de labels
                nodeReducer: (node, data) => {
                    const res = { ...data };

                    // Si el nodo está en hover (highlighted), texto negro
                    if (data.highlighted) {
                        res.label = data.label;
                        res.color = '#FFFFFF';  // Fondo blanco
                        res.labelColor = '#000000';  // Texto NEGRO
                        res.labelSize = 14;  // Texto más grande
                        res.labelWeight = 'bold';  // Texto en negrita
                    } else {
                        // Todos los demás: labels blancos
                        res.labelColor = '#e7e9ea';  // Texto blanco
                    }

                    return res;
                }
            });


            setupSigmaInteractions();

            currentGraph.forEachNode((node, attrs) => {
                currentGraph.setNodeAttribute(node, 'highlighted', false);
                currentGraph.setNodeAttribute(node, 'selected', false);
                currentGraph.setNodeAttribute(node, 'hidden', false);
                currentGraph.setNodeAttribute(node, 'color', getNodeColor(attrs.nodeType));
            });

            currentGraph.forEachEdge(edge => {
                currentGraph.setEdgeAttribute(edge, 'hidden', false);
            });

            sigma.refresh();
            console.log('✓ Nodos inicializados en estado limpio');

            updateStatistics(validNodes, validLinks);

            console.log('Graph rendered successfully');

        } catch (err) {
            console.error('Error rendering graph:', err);
            showMessage('Error renderizando grafo: ' + err.message);
        }
    }

    function getNodeColor(type) {
        // ✨ PALETA MEJORADA: Colores vibrantes y diferenciadores
        const colors = {
            'event': '#FF6B6B',      // Rojo vibrante - Eventos
            'piece': '#4ECDC4',      // Turquesa - Piezas musicales
            'composer': '#FFE66D',      // Amarillo dorado - Compositores
            'participant': '#95E1D3',      // Verde menta - Participantes
            'city': '#A8E6CF',      // Verde claro - Ciudades
            'instrument': '#FF8B94',      // Rosa coral - Instrumentos
            'event_type': '#8B7FFF',      // Púrpura - Tipos de evento
            'cycle': '#00D4FF',      // Azul cielo - Ciclos
            'premiere_type': '#FFB84D',      // Naranja - Tipo de estreno
            'location': '#A8E6CF',      // Verde - Ubicaciones
            'activity': '#FF6B9D',      // Magenta - Actividades
            'gender': '#6BCB77',      // Verde - Género
            'person': '#95E1D3',      // Verde menta - Personas
            'unknown': '#CCCCCC'       // Gris - Desconocido
        };

        return colors[type] || colors['unknown'];
    }


    function applyLayout(graph) {
        const nodeCount = graph.order;

        if (window.forceAtlas2 && typeof window.forceAtlas2.assign === 'function') {
            console.log('Using ForceAtlas2');
            try {
                window.forceAtlas2.assign(graph, {
                    iterations: Math.min(250, 150 + nodeCount / 100),
                    settings: {
                        gravity: 1,
                        scalingRatio: 50,
                        strongGravityMode: false,
                        barnesHutOptimize: nodeCount > 500,
                        jitterTolerance: 0.7,
                        edgeWeightInfluence: 1
                    }
                });
                return;
            } catch (e) {
                console.warn('ForceAtlas2 failed:', e);
            }
        }

        if (window.graphologyLayout && window.graphologyLayout.circular) {
            console.log('Using circular layout');
            try {
                window.graphologyLayout.circular.assign(graph, { scale: 100 });
                return;
            } catch (e) {
                console.warn('Circular layout failed:', e);
            }
        }

        console.log('Using custom layout');
        customForceLayout(graph);
    }

    function customForceLayout(graph) {
        const nodes = graph.nodes();
        const nodeCount = nodes.length;
        const radius = Math.sqrt(nodeCount) * 15;

        // Initial circular placement
        nodes.forEach((node, i) => {
            const angle = (2 * Math.PI * i) / nodeCount;
            graph.setNodeAttribute(node, 'x', radius * Math.cos(angle));
            graph.setNodeAttribute(node, 'y', radius * Math.sin(angle));
        });

        // Force simulation
        const iterations = Math.min(100, Math.max(50, nodeCount / 8));
        const repulsion = 800;
        const attraction = 0.02;

        for (let iter = 0; iter < iterations; iter++) {
            const displacement = new Map();
            nodes.forEach(n => displacement.set(n, { x: 0, y: 0 }));

            if (nodeCount < 300) {
                for (let i = 0; i < nodeCount; i++) {
                    for (let j = i + 1; j < nodeCount; j++) {
                        const n1 = nodes[i], n2 = nodes[j];
                        const x1 = graph.getNodeAttribute(n1, 'x');
                        const y1 = graph.getNodeAttribute(n1, 'y');
                        const x2 = graph.getNodeAttribute(n2, 'x');
                        const y2 = graph.getNodeAttribute(n2, 'y');

                        const dx = x2 - x1, dy = y2 - y1;
                        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                        const force = repulsion / (dist * dist);
                        const fx = (dx / dist) * force;
                        const fy = (dy / dist) * force;

                        displacement.get(n1).x -= fx;
                        displacement.get(n1).y -= fy;
                        displacement.get(n2).x += fx;
                        displacement.get(n2).y += fy;
                    }
                }
            }

            graph.forEachEdge((edge, attr, source, target) => {
                const x1 = graph.getNodeAttribute(source, 'x');
                const y1 = graph.getNodeAttribute(source, 'y');
                const x2 = graph.getNodeAttribute(target, 'x');
                const y2 = graph.getNodeAttribute(target, 'y');

                const dx = x2 - x1, dy = y2 - y1;
                const fx = dx * attraction;
                const fy = dy * attraction;

                displacement.get(source).x += fx;
                displacement.get(source).y += fy;
                displacement.get(target).x -= fx;
                displacement.get(target).y -= fy;
            });

            const damping = 1 - (iter / iterations);
            const maxDisp = 10 * damping;

            nodes.forEach(node => {
                const d = displacement.get(node);
                const dist = Math.sqrt(d.x * d.x + d.y * d.y) || 1;
                const limited = Math.min(dist, maxDisp);

                graph.setNodeAttribute(node, 'x',
                    graph.getNodeAttribute(node, 'x') + (d.x / dist) * limited);
                graph.setNodeAttribute(node, 'y',
                    graph.getNodeAttribute(node, 'y') + (d.y / dist) * limited);
            });
        }
    }

    // ==================== INTERACTIONS ====================
    function setupSigmaInteractions() {
        if (!sigma || !currentGraph) return;

        sigma.on('clickNode', ({ node }) => {
            const attrs = currentGraph.getNodeAttributes(node);
            const degree = currentGraph.degree(node);
            alert(`${attrs.label}\n${attrs.nodeType}\nConexiones: ${degree}`);
        });

        sigma.on('enterNode', ({ node }) => {
            highlightNode(node);
        });

        sigma.on('leaveNode', () => {
            resetHighlight();
        });
    }

    function highlightNode(nodeId) {
        if (!currentGraph) return;

        const neighbors = new Set(currentGraph.neighbors(nodeId));
        neighbors.add(nodeId);

        currentGraph.forEachNode((node, attrs) => {
            if (node === nodeId) {
                // NODO HOVER: Fondo blanco, texto negro (configurado en nodeReducer)
                currentGraph.setNodeAttribute(node, 'color', '#FFFFFF');  // Blanco
                currentGraph.setNodeAttribute(node, 'size', (attrs.size || 8) * 1.8);
                currentGraph.setNodeAttribute(node, 'highlighted', true);

            } else if (neighbors.has(node)) {
                // VECINOS: Color original
                currentGraph.setNodeAttribute(node, 'color', getNodeColor(attrs.nodeType));
                currentGraph.setNodeAttribute(node, 'size', (attrs.size || 8) * 1.2);
                currentGraph.setNodeAttribute(node, 'highlighted', false);

            } else {
                // RESTO: Oscuros
                currentGraph.setNodeAttribute(node, 'color', '#333333');
                currentGraph.setNodeAttribute(node, 'size', (attrs.size || 8) * 0.7);
                currentGraph.setNodeAttribute(node, 'highlighted', false);
            }
        });

        currentGraph.forEachEdge((edge, attrs, source, target) => {
            const connected = neighbors.has(source) && neighbors.has(target);
            currentGraph.setEdgeAttribute(edge, 'color', connected ? '#888888' : '#1a1a1a');
            currentGraph.setEdgeAttribute(edge, 'size', connected ? 1.5 : 0.3);
        });

        sigma.refresh();
    }

    function resetHighlight() {
        if (!currentGraph) return;

        currentGraph.forEachNode((node, attrs) => {
            currentGraph.setNodeAttribute(node, 'color', getNodeColor(attrs.nodeType));
            currentGraph.setNodeAttribute(node, 'size', 8);
            currentGraph.setNodeAttribute(node, 'hidden', false);
            currentGraph.setNodeAttribute(node, 'highlighted', false);
            currentGraph.setNodeAttribute(node, 'selected', false);
        });

        currentGraph.forEachEdge((edge) => {
            currentGraph.setEdgeAttribute(edge, 'color', '#404040');
            currentGraph.setEdgeAttribute(edge, 'size', 0.5);
            currentGraph.setEdgeAttribute(edge, 'hidden', false);
        });

        sigma.refresh();
    }



    function updateStatistics(nodes, links) {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setVal('stat-nodes', nodes.length);
        setVal('stat-edges', links.length);
        setVal('stat-events', nodes.filter(n => n.type === 'event').length);
        setVal('stat-pieces', nodes.filter(n => n.type === 'piece').length);
        setVal('stat-persons', nodes.filter(n => n.type === 'composer' || n.type === 'participant').length);

        if (currentGraph && nodes.length > 0) {
            let total = 0;
            currentGraph.forEachNode(n => total += currentGraph.degree(n));
            setVal('stat-degree', (total / nodes.length).toFixed(2));
        }
    }

    // ==================== CONTROLS ====================

    function populateYearSelect() {
        if (!elements.yearSelect) return;
        elements.yearSelect.innerHTML = '<option value="">Todos los años</option>';
        for (let year = MAX_YEAR; year >= MIN_YEAR; year--) {
            const opt = document.createElement('option');
            opt.value = year;
            opt.textContent = year;
            elements.yearSelect.appendChild(opt);
        }
    }

    function setupZoomControls() {
        const zoomIn = document.getElementById('zoom-in');
        const zoomOut = document.getElementById('zoom-out');
        const zoomFit = document.getElementById('zoom-fit');

        if (zoomIn) zoomIn.onclick = () => sigma?.getCamera().animatedZoom({ duration: 200 });
        if (zoomOut) zoomOut.onclick = () => sigma?.getCamera().animatedUnzoom({ duration: 200 });
        if (zoomFit) zoomFit.onclick = () => sigma?.getCamera().animatedReset({ duration: 200 });
    }

    // ==================== BÚSQUEDA EN GRAFO (PRODUCCIÓN) ====================
    function setupSearchFunctionality() {
        const input = elements.graphSearchInput;

        if (!input) {
            console.warn('Search input not found');
            return;
        }

        let searchTimeout = null;

        const performSearch = () => {
            const term = input.value.toLowerCase().trim();

            if (!currentGraph || !sigma) {
                return;
            }

            if (!term) {
                resetSearch();
                return;
            }

            const matches = new Set();

            currentGraph.forEachNode((node, attrs) => {
                if ((attrs.label || '').toLowerCase().includes(term)) {
                    matches.add(node);
                }
            });

            if (matches.size === 0) {
                resetSearch();
                return;
            }

            // Expandir a vecinos
            const expanded = new Set(matches);
            matches.forEach(m => {
                try {
                    currentGraph.neighbors(m).forEach(n => expanded.add(n));
                } catch (e) { }
            });

            // Aplicar filtro visual
            currentGraph.forEachNode(n => {
                const isMatch = matches.has(n);
                const isVisible = expanded.has(n);

                currentGraph.setNodeAttribute(n, 'hidden', !isVisible);

                if (isMatch) {
                    currentGraph.setNodeAttribute(n, 'color', '#FFD700');
                    currentGraph.setNodeAttribute(n, 'size', 12);
                    currentGraph.setNodeAttribute(n, 'highlighted', true);
                } else if (isVisible) {
                    const attrs = currentGraph.getNodeAttributes(n);
                    currentGraph.setNodeAttribute(n, 'color', getNodeColor(attrs.nodeType));
                    currentGraph.setNodeAttribute(n, 'size', 8);
                    currentGraph.setNodeAttribute(n, 'highlighted', false);
                }
            });

            currentGraph.forEachEdge((e, attrs, source, target) => {
                currentGraph.setEdgeAttribute(e, 'hidden', !expanded.has(source) || !expanded.has(target));
            });

            sigma.refresh();

            // Zoom al primer resultado
            if (matches.size > 0) {
                const firstMatch = Array.from(matches)[0];
                const nodeDisplayData = sigma.getNodeDisplayData(firstMatch);
                if (nodeDisplayData) {
                    sigma.getCamera().animate(
                        { x: nodeDisplayData.x, y: nodeDisplayData.y, ratio: 0.5 },
                        { duration: 500 }
                    );
                }
            }
        };

        const resetSearch = () => {
            if (!currentGraph || !sigma) return;

            currentGraph.forEachNode(n => {
                const attrs = currentGraph.getNodeAttributes(n);
                currentGraph.setNodeAttribute(n, 'hidden', false);
                currentGraph.setNodeAttribute(n, 'highlighted', false);
                currentGraph.setNodeAttribute(n, 'color', getNodeColor(attrs.nodeType));
                currentGraph.setNodeAttribute(n, 'size', 8);
            });

            currentGraph.forEachEdge(e => {
                currentGraph.setEdgeAttribute(e, 'hidden', false);
            });

            sigma.refresh();
        };

        // Búsqueda automática
        input.addEventListener('input', () => {
            if (searchTimeout) clearTimeout(searchTimeout);
            searchTimeout = setTimeout(performSearch, 500);
        });

        // Enter para búsqueda inmediata
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (searchTimeout) clearTimeout(searchTimeout);
                performSearch();
            }
        });

        // Escape para limpiar
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                input.value = '';
                resetSearch();
            }
        });
    }

})();
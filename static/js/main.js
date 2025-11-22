// main.js - Music Events Graph Visualization with Complete Parameter Loading

(function() {
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
    const MAX_YEAR = 2023;

    // DOM Elements
    let elements = {};

    // ==================== INITIALIZATION ====================

    window.initializeGraph = initializeGraph;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    async function init() {
        console.log('Initializing application...');
        
        // Cache DOM elements
        cacheElements();

        // Initialize worker
        initWorker();

        // Initialize database
        await initDB();

        // Setup UI
        populateYearSelect();
        setupEventListeners();
        setupZoomControls();
        setupSearchFunctionality();

        // Load filter parameters
        await loadFilterParameters();

        console.log('Application initialized');
    }

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
                console.log('Loaded cached graph data:', cached.nodes.length, 'nodes');
            }

            // Check if we need to refresh data
            const isStale = await db.isDataStale(30);
            if (isStale) {
                console.log('Cached data is stale, will refresh on first load');
            }
        } catch (err) {
            console.error('Database error:', err);
            // Continue without database support
            console.warn('Continuing without IndexedDB support');
        }
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
                throw new Error(`HTTP ${response.status}`);
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

    function initializeGraph() {
        if (initialized) return;
        initialized = true;
        
        console.log('Initializing graph...');
        
        if (graphData.nodes && graphData.nodes.length > 0) {
            renderGraph(graphData.nodes, graphData.links);
        } else {
            loadInitialData();
        }
    }

    // ==================== DATA LOADING ====================

    async function loadInitialData() {
        showLoading(true, 'Cargando datos iniciales...');
        
        try {
            const response = await fetch('/api/monthly_ingestion');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            console.log('Loaded data:', {
                events: data.events?.length || 0,
                nodes: data.nodes?.length || 0,
                links: data.links?.length || 0
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
                processEventsWithWorker(allEvents, { limit: 500 });
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
        showLoading(true, 'Cargando todos los datos...');
        
        try {
            const response = await fetch('/api/monthly_ingestion');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            
            if (data.error) {
                showMessage('Error: ' + data.error);
                return;
            }

            allEvents = data.events || [];
            
            if (data.nodes && data.nodes.length > 0) {
                graphData = { nodes: data.nodes, links: data.links || [] };
                
                // Store all data in IndexedDB
                if (db) await db.storeAllData(data);
                
                // Update filter params
                if (data.params) {
                    filterParams = data.params;
                    populateFilterDropdowns();
                }
                
                renderGraph(graphData.nodes, graphData.links);
            } else if (allEvents.length > 0) {
                processEventsWithWorker(allEvents, { limit: 500 });
            }
            
            console.log('Monthly data loaded:', allEvents.length, 'events');
        } catch (err) {
            console.error('Error loading monthly data:', err);
            showMessage('Error cargando datos. Verifique la conexión.');
        }
    }

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

    function showLoading(show, message = 'Cargando datos...') {
        if (elements.loadingOverlay) {
            elements.loadingOverlay.style.display = show ? 'flex' : 'none';
            const textEl = elements.loadingOverlay.querySelector('span');
            if (textEl) textEl.textContent = message;
        }
    }

    function showMessage(msg) {
        showLoading(false);
        if (elements.sigmaContainer) {
            elements.sigmaContainer.innerHTML = `<div class="message-display">${msg}</div>`;
        }
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

            // Add nodes
            for (const node of validNodes) {
                currentGraph.addNode(node.id, {
                    label: node.label,
                    size: node.size,
                    color: getNodeColor(node.type),
                    nodeType: node.type,
                    hidden: false
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
                labelColor: { color: '#e7e9ea' },
                minCameraRatio: 0.1,
                maxCameraRatio: 10,
                defaultNodeColor: '#999',
                defaultEdgeColor: '#404040'
            });

            setupSigmaInteractions();
            updateStatistics(validNodes, validLinks);

            console.log('Graph rendered successfully');

        } catch (err) {
            console.error('Error rendering graph:', err);
            showMessage('Error renderizando grafo: ' + err.message);
        }
    }

    function getNodeColor(type) {
        const colors = {
            'event': '#34495e',
            'piece': '#7f8c8d',
            'composer': '#e74c3c',
            'participant': '#95a5a6',
            'city': '#bdc3c7',
            'instrument': '#3498db',
            'event_type': '#9b59b6',
            'cycle': '#1abc9c',
            'premiere_type': '#f39c12',
            'location': '#bdc3c7'
        };
        return colors[type] || '#95a5a6';
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
            alert(`${attrs.label}\n\nTipo: ${attrs.nodeType}\nConexiones: ${degree}`);
        });

        sigma.on('enterNode', ({ node }) => highlightNode(node));
        sigma.on('leaveNode', () => resetHighlight());
    }

    function highlightNode(nodeId) {
        if (!currentGraph) return;
        
        const neighbors = new Set(currentGraph.neighbors(nodeId));
        neighbors.add(nodeId);

        currentGraph.forEachNode((node, attrs) => {
            currentGraph.setNodeAttribute(node, 'color', 
                neighbors.has(node) ? getNodeColor(attrs.nodeType) : '#333'
            );
        });

        currentGraph.forEachEdge((edge, attrs, source, target) => {
            const connected = neighbors.has(source) && neighbors.has(target);
            currentGraph.setEdgeAttribute(edge, 'color', connected ? '#666' : '#222');
        });

        sigma.refresh();
    }

    function resetHighlight() {
        if (!currentGraph) return;
        
        currentGraph.forEachNode((node, attrs) => {
            currentGraph.setNodeAttribute(node, 'color', getNodeColor(attrs.nodeType));
        });

        currentGraph.forEachEdge(edge => {
            currentGraph.setEdgeAttribute(edge, 'color', '#404040');
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

    function setupSearchFunctionality() {
        const input = elements.graphSearchInput;
        if (!input) return;

        const doSearch = () => {
            const term = input.value.toLowerCase().trim();
            if (!currentGraph || !sigma) return;

            if (!term) {
                currentGraph.forEachNode(n => currentGraph.setNodeAttribute(n, 'hidden', false));
                currentGraph.forEachEdge(e => currentGraph.setEdgeAttribute(e, 'hidden', false));
            } else {
                const matches = new Set();
                currentGraph.forEachNode((node, attrs) => {
                    if (attrs.label?.toLowerCase().includes(term)) {
                        matches.add(node);
                    }
                });

                const expanded = new Set(matches);
                matches.forEach(m => {
                    currentGraph.neighbors(m).forEach(n => expanded.add(n));
                });

                currentGraph.forEachNode(n => {
                    currentGraph.setNodeAttribute(n, 'hidden', !expanded.has(n));
                });

                currentGraph.forEachEdge((e, attrs, source, target) => {
                    currentGraph.setEdgeAttribute(e, 'hidden', 
                        !expanded.has(source) || !expanded.has(target));
                });
            }

            sigma.refresh();
        };

        input.addEventListener('input', doSearch);
        input.addEventListener('keypress', e => { if (e.key === 'Enter') doSearch(); });
    }

})();
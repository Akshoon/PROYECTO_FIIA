// main.js - Music Events Graph Visualization
// Uses globals: window.graphology, window.Sigma, window.forceAtlas2

(function() {
    'use strict';

    // State
    let sigma = null;
    let currentGraph = null;
    let allEvents = [];
    let graphData = { nodes: [], links: [] };
    let worker = null;
    let db = null;
    let initialized = false;

    const MIN_YEAR = 1945;
    const MAX_YEAR = 1995;

    // DOM Elements (cached after init)
    let elements = {};

    // ==================== INITIALIZATION ====================

    // Expose init function globally for navigation
    window.initializeGraph = initializeGraph;

    // Auto-init when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        console.log('Initializing application...');
        
        // Cache DOM elements
        elements = {
            sigmaContainer: document.getElementById('sigma-container'),
            loadingOverlay: document.getElementById('loading-overlay'),
            yearSelect: document.getElementById('year-select'),
            composerSearch: document.getElementById('composer-search'),
            participantSearch: document.getElementById('participant-search'),
            pieceSearch: document.getElementById('piece-search'),
            eventSearch: document.getElementById('event-search'),
            citySearch: document.getElementById('city-search'),
            limitSelect: document.getElementById('limit-select'),
            loadBtn: document.getElementById('load-btn'),
            monthlyBtn: document.getElementById('monthly-btn'),
            clearBtn: document.getElementById('clear-btn'),
            graphSearchInput: document.getElementById('graph-search-input')
        };

        // Initialize worker
        try {
            worker = new Worker('/static/js/worker.js');
            worker.onmessage = handleWorkerMessage;
            worker.onerror = (e) => console.error('Worker error:', e);
            console.log('Worker initialized');
        } catch (err) {
            console.error('Failed to init worker:', err);
        }

        // Initialize database
        initDatabase().then(database => {
            db = database;
            console.log('Database initialized');
            return db.getGraphData();
        }).then(cached => {
            if (cached.nodes && cached.nodes.length > 0) {
                graphData = cached;
                console.log('Loaded cached data:', cached.nodes.length, 'nodes');
            }
        }).catch(err => {
            console.error('Database error:', err);
        });

        // Setup UI
        populateYearSelect();
        setupEventListeners();
        setupZoomControls();
        setupSearchFunctionality();

        console.log('Application initialized');
    }

    function initializeGraph() {
        if (initialized) return;
        initialized = true;
        
        console.log('Initializing graph...');
        
        // If we have cached data, render it
        if (graphData.nodes && graphData.nodes.length > 0) {
            renderGraph(graphData.nodes, graphData.links);
        } else {
            // Load initial data
            loadInitialData();
        }
    }

    // ==================== DATA LOADING ====================

    async function loadInitialData() {
        showLoading(true);
        
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
                
                if (db) await db.storeData(data);
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
        
        if (graphData.nodes && graphData.nodes.length > 0) {
            filterGraphData(filters);
        } else if (allEvents.length > 0) {
            processEventsWithWorker(allEvents, filters);
        } else {
            showMessage('No hay datos. Use "Cargar Todo" primero.');
        }
    }

    async function handleMonthlyClick() {
        showLoading(true);
        
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
                if (db) await db.storeData(data);
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
        if (elements.citySearch) elements.citySearch.value = '';
        if (elements.limitSelect) elements.limitSelect.value = '500';
        
        if (graphData.nodes && graphData.nodes.length > 0) {
            renderGraph(graphData.nodes, graphData.links);
        }
    }

    function getFilters() {
        return {
            year: elements.yearSelect?.value || '',
            composer_q: elements.composerSearch?.value.trim() || '',
            participant_q: elements.participantSearch?.value.trim() || '',
            piece_q: elements.pieceSearch?.value.trim() || '',
            name_q: elements.eventSearch?.value.trim() || '',
            city_q: elements.citySearch?.value.trim() || '',
            limit: parseInt(elements.limitSelect?.value || '500')
        };
    }

    // ==================== WORKER COMMUNICATION ====================

    function processEventsWithWorker(events, filters) {
        if (!worker) {
            showMessage('Worker no disponible');
            return;
        }
        showLoading(true);
        worker.postMessage({ events, filters });
    }

    function filterGraphData(filters) {
        if (!worker) {
            showMessage('Worker no disponible');
            return;
        }
        
        const hasFilters = filters.year || filters.composer_q || filters.participant_q || 
                          filters.piece_q || filters.name_q || filters.city_q;
        
        if (!hasFilters) {
            renderGraph(graphData.nodes, graphData.links);
            return;
        }

        showLoading(true);
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
            // Save as cached graphData if it was from processing events
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

    function showLoading(show) {
        if (elements.loadingOverlay) {
            elements.loadingOverlay.style.display = show ? 'flex' : 'none';
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

        // Validate nodes
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
            // Create graph
            const Graph = window.graphology;
            currentGraph = new Graph({ multi: true, allowSelfLoops: false });

            // Add nodes
            for (const node of validNodes) {
                currentGraph.addNode(node.id, {
                    label: node.label,
                    x: Math.random() * 100,
                    y: Math.random() * 100,
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
                labelRenderedSizeThreshold: 6,  // Reducir umbral para mostrar más etiquetas
                labelFont: 'Inter, Arial, sans-serif',
                labelSize: 13,  // Aumentar tamaño de fuente
                labelWeight: '700',  // Hacer texto más grueso
                labelColor: { color: '#ffffff' },  // Color blanco puro
                minCameraRatio: 0.1,
                maxCameraRatio: 10,
                defaultNodeColor: '#999',
                defaultEdgeColor: '#404040',
                edgeReducer: (edge, data) => ({
                    ...data,
                    hidden: data.hidden
                }),
                nodeReducer: (node, data) => ({
                    ...data,
                    hidden: data.hidden
                })
            });

            // Setup interactions
            setupSigmaInteractions();
            
            // Update stats
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
        
        // Try ForceAtlas2
        if (window.forceAtlas2 && typeof window.forceAtlas2.assign === 'function') {
            console.log('Using ForceAtlas2');
            try {
                window.forceAtlas2.assign(graph, {
                    iterations: Math.min(100, 50 + nodeCount / 10),
                    settings: {
                        gravity: 1,
                        scalingRatio: 10,
                        strongGravityMode: true,
                        barnesHutOptimize: nodeCount > 500
                    }
                });
                return;
            } catch (e) {
                console.warn('ForceAtlas2 failed:', e);
            }
        }

        // Try circular layout
        if (window.graphologyLayout && window.graphologyLayout.circular) {
            console.log('Using circular layout');
            try {
                window.graphologyLayout.circular.assign(graph, { scale: 100 });
                return;
            } catch (e) {
                console.warn('Circular layout failed:', e);
            }
        }

        // Fallback to custom layout
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
        const iterations = Math.min(50, Math.max(20, nodeCount / 10));
        const repulsion = 400;
        const attraction = 0.01;

        for (let iter = 0; iter < iterations; iter++) {
            const displacement = new Map();
            nodes.forEach(n => displacement.set(n, { x: 0, y: 0 }));

            // Repulsion (only for small graphs)
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

            // Attraction along edges
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

            // Apply
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
        
        // Obtener el elemento del tooltip
        const tooltip = document.getElementById('node-tooltip');
        if (!tooltip) {
          console.warn('Tooltip element not found');
          return;
        }
        
        const tooltipLabel = tooltip.querySelector('.tooltip-label');
        const tooltipType = tooltip.querySelector('.tooltip-type');
        const tooltipDegree = tooltip.querySelector('.tooltip-degree');
      
        // Click en nodo
        sigma.on('clickNode', ({ node }) => {
          const attrs = currentGraph.getNodeAttributes(node);
          const degree = currentGraph.degree(node);
          alert(`${attrs.label}\n${attrs.nodeType}\nConexiones: ${degree}`);
        });
      
        // Hover sobre nodo - mostrar tooltip
        sigma.on('enterNode', ({ node, event }) => {
          if (!tooltip || !currentGraph) return;
          
          const attrs = currentGraph.getNodeAttributes(node);
          const degree = currentGraph.degree(node);
          
          // Actualizar contenido del tooltip
          if (tooltipLabel) tooltipLabel.textContent = attrs.label || 'Sin nombre';
          if (tooltipType) tooltipType.textContent = attrs.nodeType || 'unknown';
          if (tooltipDegree) tooltipDegree.textContent = `Conexiones: ${degree}`;
          
          // Posicionar el tooltip
          const x = event.x + 15;
          const y = event.y + 15;
          tooltip.style.left = `${x}px`;
          tooltip.style.top = `${y}px`;
          tooltip.classList.add('visible');
          
          // Resaltar nodo
          highlightNode(node);
        });
      
        // Mouse se mueve sobre el canvas (actualizar posición del tooltip)
        sigma.on('mousemove', ({ event }) => {
          if (tooltip && tooltip.classList.contains('visible')) {
            const x = event.x + 15;
            const y = event.y + 15;
            tooltip.style.left = `${x}px`;
            tooltip.style.top = `${y}px`;
          }
        });
      
        // Salir del nodo - ocultar tooltip
        sigma.on('leaveNode', () => {
          if (tooltip) {
            tooltip.classList.remove('visible');
          }
          resetHighlight();
        });
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

                // Also include neighbors of matches
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

    // ==================== DATABASE ====================

    async function initDatabase() {
        const dbName = 'MusicEventsDB';
        const version = 3;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, version);

            request.onerror = () => reject(request.error);
            
            request.onsuccess = () => {
                const database = request.result;
                resolve({
                    db: database,
                    
                    async storeData(data) {
                        const tx = database.transaction(['events', 'nodes', 'links', 'metadata'], 'readwrite');
                        
                        if (data.events?.length) {
                            const store = tx.objectStore('events');
                            store.clear();
                            data.events.forEach(e => e.id && store.put(e));
                        }
                        
                        if (data.nodes?.length) {
                            const store = tx.objectStore('nodes');
                            store.clear();
                            data.nodes.forEach(n => n.id && store.put(n));
                        }
                        
                        if (data.links?.length) {
                            const store = tx.objectStore('links');
                            store.clear();
                            data.links.forEach((l, i) => store.put({ id: `link_${i}`, ...l }));
                        }
                        
                        tx.objectStore('metadata').put({ key: 'lastUpdate', value: Date.now() });
                        
                        return new Promise((res, rej) => {
                            tx.oncomplete = res;
                            tx.onerror = () => rej(tx.error);
                        });
                    },
                    
                    async storeGraphData(nodes, links) {
                        return this.storeData({ nodes, links });
                    },
                    
                    async getGraphData() {
                        const tx = database.transaction(['nodes', 'links'], 'readonly');
                        
                        const getAll = store => new Promise((res, rej) => {
                            const req = store.getAll();
                            req.onsuccess = () => res(req.result || []);
                            req.onerror = () => rej(req.error);
                        });
                        
                        const nodes = await getAll(tx.objectStore('nodes'));
                        const rawLinks = await getAll(tx.objectStore('links'));
                        const links = rawLinks.map(({ source, target, label }) => ({ source, target, label }));
                        
                        return { nodes, links };
                    }
                });
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                ['events', 'nodes', 'links'].forEach(name => {
                    if (!database.objectStoreNames.contains(name)) {
                        database.createObjectStore(name, { keyPath: 'id' });
                    }
                });
                if (!database.objectStoreNames.contains('metadata')) {
                    database.createObjectStore('metadata', { keyPath: 'key' });
                }
            };
        });
    }

})();
// main.js - No ES modules, uses globals from CDN
// Graphology is available as window.graphology.Graph
// Sigma is available as window.Sigma

(async function() {
    'use strict';
    
    console.log('Starting application initialization');

    // Wait for DOM
    if (document.readyState === 'loading') {
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }

    // DOM Elements
    const sigmaContainer = document.getElementById('sigma-container');
    const filtersContainer = document.getElementById('filters-container');
    const graphWrapper = document.getElementById('graph-wrapper');
    const loadingIndicator = document.getElementById('loading-indicator');

    // Filter elements
    const yearSelect = document.getElementById('year-select');
    const composerSearch = document.getElementById('composer-search');
    const participantSearch = document.getElementById('participant-search');
    const pieceSearch = document.getElementById('piece-search');
    const eventSearch = document.getElementById('event-search');
    const citySearch = document.getElementById('city-search');
    const limitSelect = document.getElementById('limit-select');
    const loadBtn = document.getElementById('load-btn');
    const monthlyBtn = document.getElementById('monthly-btn');
    const clearBtn = document.getElementById('clear-btn');

    // State
    let sigma = null;
    let currentGraph = null;
    let allEvents = [];
    let graphData = { nodes: [], links: [] };
    let worker = null;

    const MIN_YEAR = 1945;
    const MAX_YEAR = 1995;

    // Initialize Web Worker
    try {
        worker = new Worker('/static/js/worker.js');
        console.log('Web Worker initialized');
        
        worker.onmessage = handleWorkerMessage;
        worker.onerror = (e) => console.error('Worker error:', e);
    } catch (err) {
        console.error('Failed to initialize worker:', err);
    }

    // Initialize IndexedDB
    let db = null;
    try {
        db = await initDatabase();
        console.log('Database initialized');
        
        const cached = await db.getGraphData();
        if (cached.nodes && cached.nodes.length > 0) {
            graphData = cached;
            console.log('Loaded cached graph data:', cached.nodes.length, 'nodes');
        }
    } catch (err) {
        console.error('Database error:', err);
    }

    // Populate year select
    populateYearSelect();

    // Load initial data
    setTimeout(loadInitialData, 500);

    // Event listeners
    loadBtn.addEventListener('click', handleLoadClick);
    monthlyBtn.addEventListener('click', handleMonthlyClick);
    clearBtn.addEventListener('click', handleClearClick);
    
    // Scroll behavior for filters
    setupScrollBehavior();

    // ==================== FUNCTIONS ====================

    function showLoading(show = true) {
        if (loadingIndicator) {
            loadingIndicator.style.display = show ? 'flex' : 'none';
        }
        if (show) {
            sigmaContainer.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#666;">Cargando...</div>';
        }
    }

    function populateYearSelect() {
        yearSelect.innerHTML = '<option value="">Todos los años</option>';
        for (let year = MAX_YEAR; year >= MIN_YEAR; year--) {
            const opt = document.createElement('option');
            opt.value = year;
            opt.textContent = year;
            yearSelect.appendChild(opt);
        }
    }

    async function loadInitialData() {
        // If we have cached data, render it
        if (graphData.nodes && graphData.nodes.length > 0) {
            renderGraph(graphData.nodes, graphData.links);
            return;
        }

        // Otherwise, fetch from API
        showLoading(true);
        try {
            const response = await fetch('/api/monthly_ingestion');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            console.log('Loaded data:', data.nodes?.length, 'nodes');

            if (data.nodes && data.nodes.length > 0) {
                graphData = { nodes: data.nodes, links: data.links || [] };
                allEvents = data.events || [];
                
                if (db) await db.storeData(data);
                renderGraph(graphData.nodes, graphData.links);
            } else if (data.events && data.events.length > 0) {
                allEvents = data.events;
                processEventsWithWorker(allEvents, {});
            } else {
                showMessage('No hay datos disponibles');
            }
        } catch (err) {
            console.error('Error loading data:', err);
            showMessage('Error cargando datos. Intente con "Cargar Mensual".');
        }
    }

    function handleLoadClick() {
        const filters = getFilters();
        
        if (graphData.nodes && graphData.nodes.length > 0) {
            // Filter existing graph data
            filterGraphData(filters);
        } else if (allEvents.length > 0) {
            // Process events with filters
            processEventsWithWorker(allEvents, filters);
        } else {
            showMessage('No hay datos. Cargue datos primero.');
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
                processEventsWithWorker(allEvents, {});
            }
            
            console.log('Monthly data loaded:', allEvents.length, 'events');
        } catch (err) {
            console.error('Error loading monthly data:', err);
            showMessage('Error cargando datos mensuales');
        }
    }

    function handleClearClick() {
        yearSelect.value = '';
        composerSearch.value = '';
        participantSearch.value = '';
        pieceSearch.value = '';
        eventSearch.value = '';
        citySearch.value = '';
        limitSelect.value = '500';
        
        // Re-render full graph
        if (graphData.nodes && graphData.nodes.length > 0) {
            renderGraph(graphData.nodes, graphData.links);
        }
    }

    function getFilters() {
        return {
            year: yearSelect.value,
            composer_q: composerSearch.value.trim(),
            participant_q: participantSearch.value.trim(),
            piece_q: pieceSearch.value.trim(),
            name_q: eventSearch.value.trim(),
            city_q: citySearch.value.trim(),
            limit: parseInt(limitSelect.value)
        };
    }

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
            // If this was processing events (not filtering), save as graphData
            if (!graphData.nodes || graphData.nodes.length === 0) {
                graphData = { nodes, links: links || [] };
                if (db) {
                    try {
                        await db.storeGraphData(nodes, links || []);
                    } catch (err) {
                        console.error('Error caching graph:', err);
                    }
                }
            }
            renderGraph(nodes, links || []);
        } else {
            showMessage('No se encontraron nodos');
        }
    }

    function showMessage(msg) {
        showLoading(false);
        sigmaContainer.innerHTML = `<div style="display:flex;justify-content:center;align-items:center;height:100%;font-family:Arial,sans-serif;color:#666;text-align:center;padding:20px;">${msg}</div>`;
    }

    function renderGraph(nodes, links) {
        showLoading(false);
        
        if (!nodes || nodes.length === 0) {
            showMessage('No hay nodos para mostrar');
            return;
        }

        // Validate and clean nodes
        const nodeMap = new Map();
        const validNodes = [];
        
        for (const node of nodes) {
            if (!node.id || nodeMap.has(node.id)) continue;
            
            nodeMap.set(node.id, true);
            validNodes.push({
                id: String(node.id),
                label: String(node.label || ''),
                type: node.type || 'unknown',
                x: typeof node.x === 'number' ? node.x : Math.random() * 1000,
                y: typeof node.y === 'number' ? node.y : Math.random() * 1000,
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
            nodeMap.has(link.source) && 
            nodeMap.has(link.target) &&
            link.source !== link.target
        );

        console.log('Rendering:', validNodes.length, 'nodes,', validLinks.length, 'links');

        // Destroy previous sigma instance
        if (sigma) {
            sigma.kill();
            sigma = null;
        }

        // Clear container
        sigmaContainer.innerHTML = '';

        // Check if we have edges to display
        if (validLinks.length === 0) {
            showMessage('No hay conexiones para mostrar. Ajuste los filtros.');
            return;
        }

        try {
            // Create Graphology graph
            const Graph = window.graphology;
            currentGraph = new Graph({ multi: true, allowSelfLoops: false });

            // Add nodes with random initial positions
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
            for (let i = 0; i < validLinks.length; i++) {
                const link = validLinks[i];
                try {
                    currentGraph.addEdge(link.source, link.target, {
                        label: link.label || '',
                        size: 1,
                        color: '#ccc'
                    });
                } catch (err) {
                    // Skip duplicate edges in non-multi mode
                }
            }

            // Apply layout algorithm
            console.log('Applying layout...');
            applyLayout(currentGraph);

            // Initialize Sigma
            sigma = new Sigma(currentGraph, sigmaContainer, {
                renderLabels: true,
                labelRenderedSizeThreshold: 12,
                labelFont: 'Arial',
                labelSize: 12,
                labelWeight: 'normal',
                minCameraRatio: 0.1,
                maxCameraRatio: 10,
                defaultNodeColor: '#999',
                defaultEdgeColor: '#ddd'
            });

            // Setup interactions
            setupSigmaInteractions();
            
            // Update stats
            updateStatistics(validNodes, validLinks);
            
            // Setup zoom controls
            setupZoomControls();
            
            // Setup search
            setupSearchFunctionality();

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
        
        // Try ForceAtlas2 if available (best for network graphs)
        if (window.forceAtlas2 && typeof window.forceAtlas2.assign === 'function') {
            console.log('Using ForceAtlas2 layout');
            try {
                window.forceAtlas2.assign(graph, {
                    iterations: 100,
                    settings: {
                        gravity: 1,
                        scalingRatio: 10,
                        strongGravityMode: true,
                        barnesHutOptimize: nodeCount > 500
                    }
                });
                return;
            } catch (e) {
                console.warn('ForceAtlas2 failed, using fallback:', e);
            }
        }

        // Try circular layout if available
        if (window.graphologyLayout && typeof window.graphologyLayout.circular === 'function') {
            console.log('Using circular layout');
            try {
                window.graphologyLayout.circular.assign(graph, { scale: 100 });
                return;
            } catch (e) {
                console.warn('Circular layout failed:', e);
            }
        }

        // Fallback: Custom force-directed layout (simple implementation)
        console.log('Using custom force layout');
        customForceLayout(graph);
    }

    function customForceLayout(graph) {
        // Simple force-directed layout implementation
        const nodes = graph.nodes();
        const nodeCount = nodes.length;
        
        // Initialize positions in a circle
        const radius = Math.sqrt(nodeCount) * 20;
        nodes.forEach((node, i) => {
            const angle = (2 * Math.PI * i) / nodeCount;
            graph.setNodeAttribute(node, 'x', radius * Math.cos(angle));
            graph.setNodeAttribute(node, 'y', radius * Math.sin(angle));
        });

        // Simple force simulation (reduced iterations for performance)
        const iterations = Math.min(50, nodeCount);
        const repulsion = 500;
        const attraction = 0.01;
        const maxDisplacement = 10;

        for (let iter = 0; iter < iterations; iter++) {
            const displacement = new Map();
            
            // Initialize displacement
            nodes.forEach(node => {
                displacement.set(node, { x: 0, y: 0 });
            });

            // Repulsion between all nodes (Barnes-Hut approximation for large graphs)
            if (nodeCount < 300) {
                for (let i = 0; i < nodeCount; i++) {
                    for (let j = i + 1; j < nodeCount; j++) {
                        const n1 = nodes[i];
                        const n2 = nodes[j];
                        const x1 = graph.getNodeAttribute(n1, 'x');
                        const y1 = graph.getNodeAttribute(n1, 'y');
                        const x2 = graph.getNodeAttribute(n2, 'x');
                        const y2 = graph.getNodeAttribute(n2, 'y');
                        
                        const dx = x2 - x1;
                        const dy = y2 - y1;
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
                
                const dx = x2 - x1;
                const dy = y2 - y1;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                
                const force = dist * attraction;
                const fx = dx * force;
                const fy = dy * force;
                
                displacement.get(source).x += fx;
                displacement.get(source).y += fy;
                displacement.get(target).x -= fx;
                displacement.get(target).y -= fy;
            });

            // Apply displacement with damping
            const damping = 1 - (iter / iterations);
            nodes.forEach(node => {
                const d = displacement.get(node);
                const dist = Math.sqrt(d.x * d.x + d.y * d.y) || 1;
                const limitedDist = Math.min(dist, maxDisplacement * damping);
                
                const newX = graph.getNodeAttribute(node, 'x') + (d.x / dist) * limitedDist;
                const newY = graph.getNodeAttribute(node, 'y') + (d.y / dist) * limitedDist;
                
                graph.setNodeAttribute(node, 'x', newX);
                graph.setNodeAttribute(node, 'y', newY);
            });
        }

        console.log('Custom layout complete');
    }

    function setupSigmaInteractions() {
        if (!sigma || !currentGraph) return;

        // Click node
        sigma.on('clickNode', ({ node }) => {
            const attrs = currentGraph.getNodeAttributes(node);
            const degree = currentGraph.degree(node);
            alert(`Nodo: ${attrs.label}\nTipo: ${attrs.nodeType}\nConexiones: ${degree}`);
        });

        // Hover - highlight neighbors
        let hoveredNode = null;
        
        sigma.on('enterNode', ({ node }) => {
            hoveredNode = node;
            highlightNode(node);
        });

        sigma.on('leaveNode', () => {
            hoveredNode = null;
            resetHighlight();
        });
    }

    function highlightNode(nodeId) {
        if (!currentGraph) return;
        
        const neighbors = new Set(currentGraph.neighbors(nodeId));
        neighbors.add(nodeId);

        currentGraph.forEachNode((node, attrs) => {
            currentGraph.setNodeAttribute(node, 'color', 
                neighbors.has(node) ? getNodeColor(attrs.nodeType) : '#eee'
            );
        });

        sigma.refresh();
    }

    function resetHighlight() {
        if (!currentGraph) return;
        
        currentGraph.forEachNode((node, attrs) => {
            currentGraph.setNodeAttribute(node, 'color', getNodeColor(attrs.nodeType));
        });

        sigma.refresh();
    }

    function updateStatistics(nodes, links) {
        const stats = {
            'stat-nodes': nodes.length,
            'stat-edges': links.length,
            'stat-events': nodes.filter(n => n.type === 'event').length,
            'stat-pieces': nodes.filter(n => n.type === 'piece').length,
            'stat-persons': nodes.filter(n => n.type === 'composer' || n.type === 'participant').length,
            'stat-cities': nodes.filter(n => n.type === 'city').length
        };

        for (const [id, value] of Object.entries(stats)) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        }

        // Average degree
        const degreeEl = document.getElementById('stat-degree');
        if (degreeEl && currentGraph && nodes.length > 0) {
            let totalDegree = 0;
            currentGraph.forEachNode(node => {
                totalDegree += currentGraph.degree(node);
            });
            degreeEl.textContent = (totalDegree / nodes.length).toFixed(2);
        }
    }

    function setupZoomControls() {
        const zoomIn = document.getElementById('zoom-in');
        const zoomOut = document.getElementById('zoom-out');
        const zoomFit = document.getElementById('zoom-fit');

        if (zoomIn) {
            zoomIn.onclick = () => {
                if (sigma) {
                    const camera = sigma.getCamera();
                    camera.animatedZoom({ duration: 200 });
                }
            };
        }

        if (zoomOut) {
            zoomOut.onclick = () => {
                if (sigma) {
                    const camera = sigma.getCamera();
                    camera.animatedUnzoom({ duration: 200 });
                }
            };
        }

        if (zoomFit) {
            zoomFit.onclick = () => {
                if (sigma) {
                    const camera = sigma.getCamera();
                    camera.animatedReset({ duration: 200 });
                }
            };
        }
    }

    function setupSearchFunctionality() {
        const searchInput = document.getElementById('graph-search-input');
        const searchBtn = document.getElementById('search-btn');
        
        if (!searchInput) return;

        const doSearch = () => {
            const term = searchInput.value.toLowerCase().trim();
            if (!currentGraph || !sigma) return;

            if (term === '') {
                // Show all
                currentGraph.forEachNode(node => {
                    currentGraph.setNodeAttribute(node, 'hidden', false);
                });
                currentGraph.forEachEdge(edge => {
                    currentGraph.setEdgeAttribute(edge, 'hidden', false);
                });
            } else {
                // Find matches
                const matches = new Set();
                currentGraph.forEachNode((node, attrs) => {
                    if (attrs.label && attrs.label.toLowerCase().includes(term)) {
                        matches.add(node);
                    }
                });

                // Show only matches and their edges
                currentGraph.forEachNode(node => {
                    currentGraph.setNodeAttribute(node, 'hidden', !matches.has(node));
                });

                currentGraph.forEachEdge((edge, attrs, source, target) => {
                    currentGraph.setEdgeAttribute(edge, 'hidden', 
                        !matches.has(source) || !matches.has(target)
                    );
                });
            }

            sigma.refresh();
        };

        searchInput.addEventListener('input', doSearch);
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') doSearch();
        });
        
        if (searchBtn) {
            searchBtn.addEventListener('click', doSearch);
        }
    }

    function setupScrollBehavior() {
        let lastScrollTop = 0;
        let filtersHidden = false;

        window.addEventListener('scroll', () => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

            if (scrollTop > lastScrollTop && scrollTop > 50 && !filtersHidden) {
                filtersContainer.style.transform = 'translateY(-100%)';
                filtersHidden = true;
            } else if (scrollTop < lastScrollTop && filtersHidden) {
                filtersContainer.style.transform = 'translateY(0)';
                filtersHidden = false;
            }

            lastScrollTop = Math.max(0, scrollTop);
        });
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
                        
                        if (data.events) {
                            const store = tx.objectStore('events');
                            store.clear();
                            for (const event of data.events) {
                                if (event.id) store.put(event);
                            }
                        }
                        
                        if (data.nodes) {
                            const store = tx.objectStore('nodes');
                            store.clear();
                            for (const node of data.nodes) {
                                if (node.id) store.put(node);
                            }
                        }
                        
                        if (data.links) {
                            const store = tx.objectStore('links');
                            store.clear();
                            data.links.forEach((link, i) => {
                                store.put({ id: `link_${i}`, ...link });
                            });
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
                        
                        const getAll = (store) => new Promise((res, rej) => {
                            const req = store.getAll();
                            req.onsuccess = () => res(req.result || []);
                            req.onerror = () => rej(req.error);
                        });
                        
                        const nodes = await getAll(tx.objectStore('nodes'));
                        const rawLinks = await getAll(tx.objectStore('links'));
                        const links = rawLinks.map(({ source, target, label }) => ({ source, target, label }));
                        
                        return { nodes, links };
                    },
                    
                    async getAllEvents() {
                        const tx = database.transaction(['events'], 'readonly');
                        return new Promise((res, rej) => {
                            const req = tx.objectStore('events').getAll();
                            req.onsuccess = () => res(req.result || []);
                            req.onerror = () => rej(req.error);
                        });
                    }
                });
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                const stores = [
                    { name: 'events', keyPath: 'id' },
                    { name: 'nodes', keyPath: 'id' },
                    { name: 'links', keyPath: 'id' },
                    { name: 'metadata', keyPath: 'key' }
                ];
                
                for (const { name, keyPath } of stores) {
                    if (!database.objectStoreNames.contains(name)) {
                        database.createObjectStore(name, { keyPath });
                    }
                }
            };
        });
    }

})();
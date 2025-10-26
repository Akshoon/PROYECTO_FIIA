document.addEventListener('DOMContentLoaded', function() {
    const cyContainer = document.getElementById('cy');
    const filtersContainer = document.getElementById('filters-container');
    const graphWrapper = document.getElementById('graph-wrapper');

    // Filter elements
    const yearSelect = document.getElementById('year-select');
    const composerSearch = document.getElementById('composer-search');
    const participantSearch = document.getElementById('participant-search');
    const pieceSearch = document.getElementById('piece-search');
    const eventSearch = document.getElementById('event-search');
    const citySearch = document.getElementById('city-search');
    const limitSelect = document.getElementById('limit-select');
    const loadBtn = document.getElementById('load-btn');
    const clearBtn = document.getElementById('clear-btn');

    let cy; // Instancia de Cytoscape
    const MIN_YEAR = 1945;
    const MAX_YEAR = 1995;

    // Scroll-based filter visibility
    let lastScrollTop = 0;
    let filtersHidden = false;

    window.addEventListener('scroll', function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        if (scrollTop > lastScrollTop && scrollTop > 20) {
            // Scrolling down and past 20px - show filters at bottom
            if (!filtersHidden) {
                filtersContainer.style.transform = 'translateY(0)';
                graphWrapper.style.marginTop = '20px';
                filtersHidden = true;
            }
        } else if (scrollTop < lastScrollTop || scrollTop <= 20) {
            // Scrolling up or near top - hide filters
            if (filtersHidden) {
                filtersContainer.style.transform = 'translateY(100%)';
                graphWrapper.style.marginTop = '20px';
                filtersHidden = false;
            }
        }

        lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
    });

    // Populate year dropdown
    function populateYearSelect() {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Todos los años';
        yearSelect.appendChild(option);

        for (let year = MAX_YEAR; year >= MIN_YEAR; year--) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        }
    }

    populateYearSelect();

    // Función para obtener y renderizar el grafo
    function fetchAndRenderGraph(params) {
        // Llamar al endpoint de Flask para obtener datos del grafo
        fetch(`/api/graph_data?${params.toString()}`)
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    alert('Error: ' + data.error);
                    return;
                }

                // Destruir instancia anterior si existe
                if (cy) {
                    cy.destroy();
                }

                // Inicializar Cytoscape con los datos
                cy = cytoscape({
                    container: cyContainer,
                    elements: {
                        nodes: data.nodes,
                        edges: data.edges
                    },
                    style: [
                        {
                            selector: 'node',
                            style: {
                                'label': 'data(label)',
                                'text-valign': 'center',
                                'text-halign': 'center',
                                'color': '#333',
                                'font-size': '10px',
                                'font-weight': '500',
                                'text-outline-width': 2,
                                'text-outline-color': '#fff',
                                'text-wrap': 'wrap',
                                'text-max-width': '100px',
                                'width': 'mapData(degree, 0, 100, 30, 80)',
                                'height': 'mapData(degree, 0, 100, 30, 80)',
                                'shape': 'ellipse',
                                'border-width': 2,
                                'border-color': '#fff',
                                'transition-property': 'background-color, border-color, border-width',
                                'transition-duration': '0.3s'
                            }
                        },
                        {
                            selector: 'node[type="event"]',
                            style: {
                                'background-color': '#34495e',
                                'border-color': '#2c3e50'
                            }
                        },
                        {
                            selector: 'node[type="piece"]',
                            style: {
                                'background-color': '#7f8c8d',
                                'border-color': '#6c757d'
                            }
                        },
                        {
                            selector: 'node[type="composer"]',
                            style: {
                                'background-color': '#95a5a6',
                                'border-color': '#7f8c8d'
                            }
                        },
                        {
                            selector: 'node[type="participant"]',
                            style: {
                                'background-color': '#95a5a6',
                                'border-color': '#7f8c8d'
                            }
                        },
                        {
                            selector: 'node[type="city"]',
                            style: {
                                'background-color': '#bdc3c7',
                                'border-color': '#95a5a6',
                                'color': '#2c3e50',
                                'text-outline-color': '#ecf0f1'
                            }
                        },
                        {
                            selector: 'node:hover',
                            style: {
                                'border-width': 3,
                                'border-color': '#333'
                            }
                        },
                        {
                            selector: 'node:selected',
                            style: {
                                'border-width': 4,
                                'border-color': '#FF6B35',
                                'overlay-opacity': 0.2,
                                'overlay-color': '#FF6B35'
                            }
                        },
                        {
                            selector: 'node.highlighted',
                            style: {
                                'border-width': 4,
                                'border-color': '#FF6B35',
                                'background-color': '#FFD93D'
                            }
                        },
                        {
                            selector: 'node.faded',
                            style: {
                                'opacity': 0.2
                            }
                        },
                        {
                            selector: 'edge',
                            style: {
                                'width': 1.5,
                                'line-color': '#ccc',
                                'target-arrow-color': '#ccc',
                                'target-arrow-shape': 'triangle',
                                'arrow-scale': 0.8,
                                'curve-style': 'bezier',
                                'opacity': 0.6
                            }
                        },
                        {
                            selector: 'edge.highlighted',
                            style: {
                                'line-color': '#FF6B35',
                                'target-arrow-color': '#FF6B35',
                                'width': 3,
                                'opacity': 1
                            }
                        },
                        {
                            selector: 'edge.faded',
                            style: {
                                'opacity': 0.1
                            }
                        }
                    ],
                    layout: {
                        name: 'cose',
                        animate: true,
                        animationDuration: 2000,
                        animationEasing: 'ease-in-out',
                        nodeRepulsion: 25000,
                        idealEdgeLength: 200,
                        edgeElasticity: 150,
                        nestingFactor: 5,
                        gravity: 80,
                        numIter: 2500,
                        initialTemp: 500,
                        coolingFactor: 0.95,
                        minTemp: 1.0,
                        randomize: false,
                        fit: true,
                        padding: 50
                    }
                });

                // Calculate node degrees for sizing
                cy.nodes().forEach(node => {
                    node.data('degree', node.degree());
                });

                // Update statistics
                updateStatistics();

                // Setup zoom controls
                setupZoomControls();

                // Setup search functionality
                setupSearchFunctionality();

                // Hacer interactivo: click
                cy.on('tap', 'node', function(evt) {
                    const node = evt.target;
                    const info = `Nodo: ${node.data('label')}\nTipo: ${node.data('type')}\nConexiones: ${node.degree()}`;
                    alert(info);
                });
            })
            .catch(error => {
                console.error('Error fetching graph data:', error);
                alert('Error al cargar los datos del grafo.');
            });
    }

    // Load button event
    loadBtn.addEventListener('click', function() {
        const selectedYear = yearSelect.value;
        const params = new URLSearchParams();

        if (selectedYear) {
            params.append('year', selectedYear);
        }

        // Agregar filtros específicos
        const composerTerm = composerSearch.value.trim();
        if (composerTerm) {
            params.append('composer_q', composerTerm);
        }

        const participantTerm = participantSearch.value.trim();
        if (participantTerm) {
            params.append('participant_q', participantTerm);
        }

        const pieceTerm = pieceSearch.value.trim();
        if (pieceTerm) {
            params.append('piece_q', pieceTerm);
        }

        const eventTerm = eventSearch.value.trim();
        if (eventTerm) {
            params.append('name_q', eventTerm);
        }

        const cityTerm = citySearch.value.trim();
        if (cityTerm) {
            params.append('city_q', cityTerm);
        }

        // Agregar límite seleccionado
        const selectedLimit = limitSelect.value;
        params.append('limit', selectedLimit);

        fetchAndRenderGraph(params);
    });

    // Clear button event
    clearBtn.addEventListener('click', function() {
        yearSelect.value = '';
        composerSearch.value = '';
        participantSearch.value = '';
        pieceSearch.value = '';
        eventSearch.value = '';
        citySearch.value = '';
        limitSelect.value = '500';
    });

    // Statistics Update Function
    function updateStatistics() {
        if (!cy) return;

        const nodes = cy.nodes();
        const edges = cy.edges();

        document.getElementById('stat-nodes').textContent = nodes.length;
        document.getElementById('stat-edges').textContent = edges.length;
        document.getElementById('stat-events').textContent = nodes.filter('[type="event"]').length;
        document.getElementById('stat-pieces').textContent = nodes.filter('[type="piece"]').length;

        const composers = nodes.filter('[type="composer"]').length;
        const participants = nodes.filter('[type="participant"]').length;
        document.getElementById('stat-persons').textContent = composers + participants;

        document.getElementById('stat-cities').textContent = nodes.filter('[type="city"]').length;

        // Calculate average degree
        if (nodes.length > 0) {
            const totalDegree = nodes.reduce((sum, node) => sum + node.degree(), 0);
            const avgDegree = (totalDegree / nodes.length).toFixed(2);
            document.getElementById('stat-degree').textContent = avgDegree;
        } else {
            document.getElementById('stat-degree').textContent = '0';
        }
    }

    // Zoom Controls Setup
    function setupZoomControls() {
        document.getElementById('zoom-in').addEventListener('click', function() {
            if (cy) {
                cy.zoom(cy.zoom() * 1.2);
                cy.center();
            }
        });

        document.getElementById('zoom-out').addEventListener('click', function() {
            if (cy) {
                cy.zoom(cy.zoom() * 0.8);
                cy.center();
            }
        });
        
        document.getElementById('zoom-fit').addEventListener('click', function() {
            if (cy) {
                cy.fit(null, 50);
            }
        });
    }

    // Search Functionality Setup
    function setupSearchFunctionality() {
        const searchInput = document.getElementById('graph-search-input');
        
        searchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase().trim();
            
            if (!cy) return;

            if (searchTerm === '') {
                // Reset all nodes and edges
                cy.elements().removeClass('highlighted faded');
                return;
            }

            // Find matching nodes
            const matchingNodes = cy.nodes().filter(function(node) {
                const label = node.data('label').toLowerCase();
                return label.includes(searchTerm);
            });

            if (matchingNodes.length > 0) {
                // Fade all elements
                cy.elements().addClass('faded');
                
                // Highlight matching nodes and their connections
                matchingNodes.removeClass('faded').addClass('highlighted');
                matchingNodes.connectedEdges().removeClass('faded').addClass('highlighted');
                matchingNodes.neighborhood().removeClass('faded');
            } else {
                // No matches, show all
                cy.elements().removeClass('highlighted faded');
            }
        });
    }
});

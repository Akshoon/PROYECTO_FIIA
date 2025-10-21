document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('search-form');
    const cyContainer = document.getElementById('cy');

    let cy; // Instancia de Cytoscape

    form.addEventListener('submit', function(event) {
        event.preventDefault();

        // Recopilar parámetros del formulario
        const formData = new FormData(form);
        const params = new URLSearchParams();
        for (let [key, value] of formData.entries()) {
            if (value.trim()) {
                params.append(key, value.trim());
            }
        }

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
                            selector: 'node[type="event"]',
                            style: {
                                'background-color': '#0074D9',
                                'label': 'data(label)',
                                'text-valign': 'center',
                                'text-halign': 'center',
                                'color': '#fff',
                                'font-size': '12px'
                            }
                        },
                        {
                            selector: 'node[type="composer"]',
                            style: {
                                'background-color': '#FF4136',
                                'label': 'data(label)',
                                'text-valign': 'center',
                                'text-halign': 'center',
                                'color': '#fff',
                                'font-size': '12px'
                            }
                        },
                        {
                            selector: 'node[type="participant"]',
                            style: {
                                'background-color': '#2ECC40',
                                'label': 'data(label)',
                                'text-valign': 'center',
                                'text-halign': 'center',
                                'color': '#fff',
                                'font-size': '12px'
                            }
                        },
                        {
                            selector: 'node[type="city"]',
                            style: {
                                'background-color': '#FFDC00',
                                'label': 'data(label)',
                                'text-valign': 'center',
                                'text-halign': 'center',
                                'color': '#000',
                                'font-size': '12px'
                            }
                        },
                        {
                            selector: 'node[type="piece"]',
                            style: {
                                'background-color': '#B10DC9',
                                'label': 'data(label)',
                                'text-valign': 'center',
                                'text-halign': 'center',
                                'color': '#fff',
                                'font-size': '12px'
                            }
                        },
                        {
                            selector: 'edge',
                            style: {
                                'width': 2,
                                'line-color': '#ccc',
                                'target-arrow-color': '#ccc',
                                'target-arrow-shape': 'triangle',
                                'label': 'data(label)',
                                'font-size': '10px',
                                'text-background-color': '#fff',
                                'text-background-opacity': 0.8
                            }
                        }
                    ],
                    layout: {
                        name: 'cose' // Layout automático
                    }
                });

                // Hacer interactivo: zoom, pan, click
                cy.on('tap', 'node', function(evt) {
                    const node = evt.target;
                    alert(`Nodo: ${node.data('label')} (Tipo: ${node.data('type')})`);
                });

                // Ajustar tamaño del contenedor
                cyContainer.style.width = '100%';
                cyContainer.style.height = '600px';
            })
            .catch(error => {
                console.error('Error fetching graph data:', error);
                alert('Error al cargar los datos del grafo.');
            });
    });
});

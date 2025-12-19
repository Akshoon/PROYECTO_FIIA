// Table View - Base de Conciertos con IndexedDB Cache
'use strict';

// Estado global
let state = {
    currentTab: 'events',
    currentPage: 1,
    perPage: 50,
    totalItems: 0,
    allData: {
        events: [],
        participants: [],
        composers: [],
        cities: [],
        locations: []
    },
    filteredData: [],
    filters: {
        categories: [],
        search: '',
        yearFrom: null,
        yearTo: null,
        composer: '',
        city: '',
        participant: ''
    },
    sortColumn: null,
    sortDirection: 'asc'
};

// Instancia de base de datos
let db = null;

// Configuración de columnas por tipo de datos
const tableConfigs = {
    events: [
        { key: 'name', label: 'Nombre del Evento', sortable: true, width: '20%' },
        { key: 'date', label: 'Fecha', sortable: true, width: '10%' },
        { key: 'event_type', label: 'Tipo', sortable: true, width: '12%' },
        { key: 'location', label: 'Ubicación', sortable: true, width: '18%' },
        { key: 'cycle', label: 'Ciclo', sortable: true, width: '12%' },
        { key: 'participants_count', label: 'Participantes', sortable: true, width: '8%' },
        { key: 'genders', label: 'Géneros', sortable: false, width: '12%' },
        { key: 'actions', label: 'Acciones', sortable: false, width: '8%' }
    ],
    participants: [
        { key: 'name', label: 'Nombre', sortable: true, width: '30%' },
        { key: 'activity', label: 'Actividad', sortable: true, width: '25%' },
        { key: 'gender', label: 'Género', sortable: true, width: '15%' },
        { key: 'events_count', label: 'Eventos', sortable: true, width: '15%' },
        { key: 'actions', label: 'Acciones', sortable: false, width: '15%' }
    ],
    composers: [
        { key: 'name', label: 'Nombre', sortable: true, width: '40%' },
        { key: 'pieces_count', label: 'Obras', sortable: true, width: '20%' },
        { key: 'events_count', label: 'Eventos', sortable: true, width: '20%' },
        { key: 'actions', label: 'Acciones', sortable: false, width: '20%' }
    ],
    cities: [
        { key: 'name', label: 'Ciudad', sortable: true, width: '40%' },
        { key: 'events_count', label: 'Eventos', sortable: true, width: '30%' },
        { key: 'actions', label: 'Acciones', sortable: false, width: '30%' }
    ],
    locations: [
        { key: 'name', label: 'Lugar/Venue', sortable: true, width: '40%' },
        { key: 'city', label: 'Ciudad', sortable: true, width: '25%' },
        { key: 'events_count', label: 'Eventos', sortable: true, width: '20%' },
        { key: 'actions', label: 'Acciones', sortable: false, width: '15%' }
    ]
};

// ==================== INICIALIZACIÓN ====================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Inicializando vista de tabla...');
    await initDB();
    setupEventListeners();
    await loadData();
    renderCategoryFilters();
    renderTable();
});

// Inicializar base de datos IndexedDB
async function initDB() {
    try {
        // Verificar si MusicEventsDB está disponible
        if (!window.MusicEventsDB) {
            console.warn('MusicEventsDB no está disponible, esperando...');
            await new Promise(resolve => setTimeout(resolve, 100));
            if (!window.MusicEventsDB) {
                console.error('MusicEventsDB no se cargó correctamente');
                return;
            }
        }

        db = window.MusicEventsDB;
        await db.init();
        console.log('IndexedDB inicializada correctamente');

        // Verificar estadísticas del caché
        const stats = await db.getStats();
        console.log('Estadísticas de caché:', stats);

    } catch (err) {
        console.error('Error inicializando IndexedDB:', err);
        console.warn('Continuando sin soporte de caché');
    }
}

// Setup de event listeners
function setupEventListeners() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.currentTarget.dataset.tab;
            switchTab(tab);
        });
    });

    // Búsqueda en tiempo real
    document.getElementById('search-input').addEventListener('input', (e) => {
        state.filters.search = e.target.value;
        applyFilters();
    });

    // Filtros de año
    document.getElementById('year-from').addEventListener('change', (e) => {
        state.filters.yearFrom = e.target.value ? parseInt(e.target.value) : null;
    });

    document.getElementById('year-to').addEventListener('change', (e) => {
        state.filters.yearTo = e.target.value ? parseInt(e.target.value) : null;
    });

    // Filtros avanzados
    document.getElementById('composer-filter').addEventListener('change', (e) => {
        state.filters.composer = e.target.value;
    });

    document.getElementById('city-filter').addEventListener('change', (e) => {
        state.filters.city = e.target.value;
    });

    document.getElementById('participant-filter').addEventListener('change', (e) => {
        state.filters.participant = e.target.value;
    });
}

// ==================== CARGA DE DATOS CON CACHÉ ====================

async function loadData() {
    showLoading(true);
    try {
        let data = null;
        let fromCache = false;

        // INTENTO 1: Cargar desde caché si está disponible
        if (db && db.db) {
            console.log('Intentando cargar desde caché...');
            const cachedEvents = await db.getAllEvents();
            const cachedParams = await db.getAllFilterParams();

            if (cachedEvents && cachedEvents.length > 0) {
                console.log(`✅ Datos cargados desde caché: ${cachedEvents.length} eventos`);
                data = {
                    events: cachedEvents,
                    params: cachedParams
                };
                fromCache = true;

                // Verificar si los datos están obsoletos
                const isStale = await db.isDataStale(30); // 30 días
                if (isStale) {
                    console.log('⚠️ Los datos en caché están obsoletos (>30 días)');
                    showToast('Los datos pueden estar desactualizados. Refrescando...', 'warning');
                    // Recargar en segundo plano
                    loadDataFromAPI(true);
                } else {
                    const lastUpdate = await db.getLastUpdate();
                    const daysAgo = Math.floor((Date.now() - lastUpdate) / (1000 * 60 * 60 * 24));
                    console.log(`📅 Datos actualizados hace ${daysAgo} días`);
                }
            }
        }

        // INTENTO 2: Si no hay caché, cargar desde API
        if (!data) {
            console.log('No hay caché disponible, cargando desde API...');
            data = await loadDataFromAPI(false);
        }

        // Procesar y mostrar datos
        if (data && data.events) {
            processData(data);

            if (fromCache) {
                showToast('Datos cargados desde caché local', 'success');
            } else {
                showToast('Datos cargados desde el servidor', 'success');
            }
        } else {
            showError('No se pudieron cargar los datos');
        }

    } catch (error) {
        console.error('Error cargando datos:', error);
        showError('Error al cargar los datos: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Cargar datos desde la API
async function loadDataFromAPI(silent = false) {
    if (!silent) {
        showLoading(true);
    }

    try {
        const response = await fetch('/api/monthly_ingestion');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log('Datos recibidos de la API:', {
            events: data.events?.length || 0,
            params: data.params ? Object.keys(data.params).length : 0
        });

        // Guardar en caché para uso futuro
        if (db && db.db && data.events) {
            try {
                console.log('💾 Guardando datos en caché...');
                await db.storeAllData({
                    events: data.events,
                    nodes: data.nodes || [],
                    links: data.links || [],
                    params: data.params || {},
                    timestamp: Date.now()
                });
                console.log('✅ Datos guardados en caché exitosamente');
            } catch (cacheError) {
                console.warn('⚠️ No se pudo guardar en caché:', cacheError);
            }
        }

        if (!silent) {
            processData(data);
        }

        return data;

    } catch (error) {
        console.error('Error cargando desde API:', error);
        if (!silent) {
            throw error;
        }
        return null;
    } finally {
        if (!silent) {
            showLoading(false);
        }
    }
}

// Procesar datos recibidos
function processData(data) {
    console.log('Procesando datos...');

    // Procesar eventos - ACCESO CORRECTO A LOS DATOS
    state.allData.events = (data.events || []).map(event => {
        // Extraer géneros únicos de participantes
        const genders = new Set();
        (event.participants || []).forEach(p => {
            if (p.gender) genders.add(p.gender);
        });

        return {
            ...event,
            participants_count: (event.participants || []).length,
            genders: Array.from(genders).join(', ') || 'N/A',
            date: formatDate(event.date) || 'N/A',
            year: event.year || 'N/A',
            cycle: event.cycle || 'Ninguno',
            event_type: event.event_type || 'N/A',
            location: event.location || 'N/A'
        };
    });

    // Función para formatear fecha
    function formatDate(dateStr) {
        if (!dateStr) return null;
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            return date.toLocaleDateString('es-CL', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        } catch (e) {
            return dateStr;
        }
    }

    // Extraer participantes únicos
    const participantsMap = new Map();
    state.allData.events.forEach(event => {
        (event.participants || []).forEach(p => {
            if (!participantsMap.has(p.name)) {
                participantsMap.set(p.name, {
                    name: p.name,
                    activity: p.activity || 'N/A',
                    gender: p.gender || 'N/A',
                    events_count: 0,
                    raw_data: p
                });
            }
            participantsMap.get(p.name).events_count++;
        });
    });
    state.allData.participants = Array.from(participantsMap.values());

    // Extraer compositores únicos
    const composersMap = new Map();
    state.allData.events.forEach(event => {
        (event.program || []).forEach(piece => {
            (piece.composers || []).forEach(composer => {
                if (composer && composer !== 'Desconocido') {
                    if (!composersMap.has(composer)) {
                        composersMap.set(composer, {
                            name: composer,
                            pieces_count: 0,
                            events_count: 0
                        });
                    }
                    composersMap.get(composer).pieces_count++;
                }
            });
        });
    });

    // Contar eventos por compositor
    state.allData.events.forEach(event => {
        const composers = new Set();
        (event.program || []).forEach(piece => {
            (piece.composers || []).forEach(c => composers.add(c));
        });
        composers.forEach(c => {
            if (composersMap.has(c)) {
                composersMap.get(c).events_count++;
            }
        });
    });

    state.allData.composers = Array.from(composersMap.values());

    // Extraer ciudades únicas
    const citiesMap = new Map();
    state.allData.events.forEach(event => {
        const city = extractCityName(event.location);
        if (city) {
            if (!citiesMap.has(city)) {
                citiesMap.set(city, { name: city, events_count: 0 });
            }
            citiesMap.get(city).events_count++;
        }
    });
    state.allData.cities = Array.from(citiesMap.values());

    // Extraer lugares/venues únicos
    const locationsMap = new Map();
    state.allData.events.forEach(event => {
        const fullLocation = event.location;
        if (fullLocation && fullLocation !== 'N/A') {
            // Extraer nombre del venue (parte antes de la coma)
            let venueName = fullLocation;
            let city = 'N/A';

            if (fullLocation.includes(',')) {
                const parts = fullLocation.split(',');
                venueName = parts[0].trim();
                city = extractCityName(fullLocation) || parts[1].trim();
            }

            if (!locationsMap.has(venueName)) {
                locationsMap.set(venueName, {
                    name: venueName,
                    city: city,
                    events_count: 0
                });
            }
            locationsMap.get(venueName).events_count++;
        }
    });
    state.allData.locations = Array.from(locationsMap.values());

    // Poblar filtros
    populateFilterLists(data.params || {});

    console.log('✅ Datos procesados:', {
        events: state.allData.events.length,
        participants: state.allData.participants.length,
        composers: state.allData.composers.length,
        cities: state.allData.cities.length,
        locations: state.allData.locations.length
    });

    // Iniciar con todos los datos
    applyFilters();
}

// Extraer nombre de ciudad
function extractCityName(locationStr) {
    if (!locationStr) return null;

    try {
        if (locationStr.includes(',') && locationStr.includes('(')) {
            const parts = locationStr.split(',');
            if (parts.length >= 2) {
                return parts[1].split('(')[0].trim();
            }
        }
        if (locationStr.includes('(')) {
            return locationStr.split('(')[0].trim();
        }
        if (locationStr.includes(',')) {
            const parts = locationStr.split(',');
            return parts[parts.length - 1].trim();
        }
        return locationStr.trim();
    } catch (e) {
        return null;
    }
}

// Poblar listas de filtros
function populateFilterLists(params) {
    const composersList = document.getElementById('composers-list');
    const citiesList = document.getElementById('cities-list');
    const participantsList = document.getElementById('participants-list');

    composersList.innerHTML = '';
    citiesList.innerHTML = '';
    participantsList.innerHTML = '';

    // Compositores
    state.allData.composers.forEach(c => {
        const option = document.createElement('option');
        option.value = c.name;
        composersList.appendChild(option);
    });

    // Ciudades
    state.allData.cities.forEach(city => {
        const option = document.createElement('option');
        option.value = city.name;
        citiesList.appendChild(option);
    });

    // Participantes
    state.allData.participants.forEach(p => {
        const option = document.createElement('option');
        option.value = p.name;
        participantsList.appendChild(option);
    });
}

// ==================== FILTROS Y CATEGORÍAS ====================

function renderCategoryFilters() {
    const container = document.getElementById('category-filters');
    const categories = [
        { id: 'concert', label: 'Concierto', icon: 'music' },
        { id: 'symphony', label: 'Sinfonía', icon: 'guitar' },
        { id: 'opera', label: 'Ópera', icon: 'theater-masks' },
        { id: 'chamber', label: 'Música de Cámara', icon: 'compact-disc' }
    ];

    container.innerHTML = categories.map(cat => `
        <button class="filter-btn" data-category="${cat.id}" onclick="toggleCategoryFilter('${cat.id}')">
            <i class="fas fa-${cat.icon}"></i>
            <span>${cat.label}</span>
        </button>
    `).join('');
}

function toggleCategoryFilter(category) {
    const index = state.filters.categories.indexOf(category);
    if (index > -1) {
        state.filters.categories.splice(index, 1);
    } else {
        state.filters.categories.push(category);
    }

    const btn = document.querySelector(`[data-category="${category}"]`);
    btn.classList.toggle('active');

    applyFilters();
}

function applyFilters() {
    console.log('Aplicando filtros:', state.filters);

    const currentData = state.allData[state.currentTab];

    state.filteredData = currentData.filter(item => {
        // Filtro de búsqueda
        if (state.filters.search) {
            const searchLower = state.filters.search.toLowerCase();
            const searchFields = Object.values(item).join(' ').toLowerCase();
            if (!searchFields.includes(searchLower)) return false;
        }

        // Filtros específicos de eventos
        if (state.currentTab === 'events') {
            if (state.filters.yearFrom && item.year !== 'N/A' && item.year < state.filters.yearFrom) return false;
            if (state.filters.yearTo && item.year !== 'N/A' && item.year > state.filters.yearTo) return false;

            if (state.filters.city) {
                const city = extractCityName(item.location);
                if (!city || !city.toLowerCase().includes(state.filters.city.toLowerCase())) {
                    return false;
                }
            }

            if (state.filters.composer) {
                const composers = (item.program || []).flatMap(p => p.composers || []);
                if (!composers.some(c => c.toLowerCase().includes(state.filters.composer.toLowerCase()))) {
                    return false;
                }
            }

            if (state.filters.participant) {
                const participants = (item.participants || []).map(p => p.name);
                if (!participants.some(p => p.toLowerCase().includes(state.filters.participant.toLowerCase()))) {
                    return false;
                }
            }
        }

        return true;
    });

    state.currentPage = 1;
    state.totalItems = state.filteredData.length;
    renderTable();
    updateResultsInfo();
}

// ==================== CONTINÚA EN LA SIGUIENTE PARTE ====================

// ==================== NAVEGACIÓN Y RENDERIZADO ====================

function switchTab(tab) {
    state.currentTab = tab;
    state.currentPage = 1;
    state.filters = {
        categories: [],
        search: '',
        yearFrom: null,
        yearTo: null,
        composer: '',
        city: '',
        participant: ''
    };

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    document.getElementById('search-input').value = '';
    document.getElementById('year-from').value = '';
    document.getElementById('year-to').value = '';
    document.getElementById('composer-filter').value = '';
    document.getElementById('city-filter').value = '';
    document.getElementById('participant-filter').value = '';

    applyFilters();
}

function renderTable() {
    const config = tableConfigs[state.currentTab];
    const headers = document.getElementById('table-headers');
    const tbody = document.getElementById('table-body');

    headers.innerHTML = config.map(col => `
        <th style="width: ${col.width}" ${col.sortable ? `onclick="sortBy('${col.key}')"` : ''} class="${col.sortable ? 'sortable' : ''}">
            ${col.label}
            ${col.sortable ? '<i class="fas fa-sort sort-icon"></i>' : ''}
        </th>
    `).join('');

    const startIndex = (state.currentPage - 1) * state.perPage;
    const endIndex = startIndex + state.perPage;
    const pageData = state.filteredData.slice(startIndex, endIndex);

    tbody.innerHTML = pageData.map((item, index) => {
        const cells = config.map(col => {
            if (col.key === 'actions') {
                return `<td>${renderActions(item, startIndex + index)}</td>`;
            }
            return `<td>${formatCell(item[col.key])}</td>`;
        });
        return `<tr>${cells.join('')}</tr>`;
    }).join('');

    renderPagination();
    updateResultsInfo();
}

function formatCell(value) {
    if (value === null || value === undefined || value === 'N/A') {
        return '<span class="text-muted">N/A</span>';
    }
    if (value === 'Ninguno') {
        return '<span class="text-muted">Ninguno</span>';
    }
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'number') return value.toLocaleString();
    return value.toString();
}

function renderActions(item, index) {
    return `
        <div class="action-buttons">
            <button class="action-btn view-btn" onclick="viewInGraph(${index})" title="Ver en grafo">
                <i class="fas fa-eye"></i>
            </button>
            <button class="action-btn edit-btn" onclick="editItem(${index})" title="Ver detalles">
                <i class="fas fa-info-circle"></i>
            </button>
        </div>
    `;
}

function viewInGraph(index) {
    const startIndex = (state.currentPage - 1) * state.perPage;
    const actualIndex = startIndex + index;
    const item = state.filteredData[actualIndex];

    if (!item) {
        console.error('Item no encontrado');
        return;
    }

    console.log('Navegando al grafo con item:', item);

    // Crear objeto de filtros para sessionStorage
    const filters = {
        tab: state.currentTab,
        timestamp: Date.now()
    };

    // Agregar datos según el tipo de tab
    if (state.currentTab === 'events') {
        filters.event = item.name || '';
        filters.year = (item.year && item.year !== 'N/A') ? item.year : null;
        filters.location = item.location || null;
    } else if (state.currentTab === 'participants') {
        filters.participant = item.name || '';
        filters.activity = item.activity || null;
    } else if (state.currentTab === 'composers') {
        filters.composer = item.name || '';
    } else if (state.currentTab === 'cities') {
        filters.city = item.name || '';
    } else if (state.currentTab === 'locations') {
        filters.location = item.name || '';
        filters.city = item.city || null;
    }

    // Guardar en sessionStorage para que main.js lo lea
    sessionStorage.setItem('graphFiltersFromTable', JSON.stringify(filters));
    console.log('📊 Filtros guardados en sessionStorage:', filters);

    // Redirigir al grafo (usando /#app para ir directo al grafo)
    window.location.href = '/#app';
}

function editItem(index) {
    const startIndex = (state.currentPage - 1) * state.perPage;
    const actualIndex = startIndex + index;
    const item = state.filteredData[actualIndex];

    console.log('Ver detalles:', item);

    let details = '<div class="details-modal">';
    details += '<div class="details-content">';
    details += `<h3>${item.name || 'Sin nombre'}</h3>`;
    details += '<table class="details-table">';

    for (const [key, value] of Object.entries(item)) {
        if (key === 'raw_data' || key === 'id') continue;
        details += `<tr><th>${key}</th><td>${JSON.stringify(value, null, 2)}</td></tr>`;
    }

    details += '</table>';
    details += '<button onclick="closeDetailsModal()">Cerrar</button>';
    details += '</div></div>';

    const modalDiv = document.createElement('div');
    modalDiv.id = 'details-modal-container';
    modalDiv.innerHTML = details;
    document.body.appendChild(modalDiv);
}

function closeDetailsModal() {
    const modal = document.getElementById('details-modal-container');
    if (modal) modal.remove();
}

function sortBy(column) {
    if (state.sortColumn === column) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortColumn = column;
        state.sortDirection = 'asc';
    }

    state.filteredData.sort((a, b) => {
        const aVal = a[column];
        const bVal = b[column];

        if (aVal === 'N/A' || aVal === null || aVal === undefined) return 1;
        if (bVal === 'N/A' || bVal === null || bVal === undefined) return -1;

        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return state.sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }

        const aStr = String(aVal || '').toLowerCase();
        const bStr = String(bVal || '').toLowerCase();

        if (state.sortDirection === 'asc') {
            return aStr.localeCompare(bStr);
        } else {
            return bStr.localeCompare(aStr);
        }
    });

    renderTable();
}

// ==================== PAGINACIÓN ====================

function renderPagination() {
    const totalPages = Math.ceil(state.totalItems / state.perPage);
    const pagination = document.getElementById('pagination');

    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    const pages = [];
    const maxPages = 7;

    if (totalPages <= maxPages) {
        for (let i = 1; i <= totalPages; i++) {
            pages.push(i);
        }
    } else {
        if (state.currentPage <= 4) {
            pages.push(1, 2, 3, 4, 5, '...', totalPages);
        } else if (state.currentPage >= totalPages - 3) {
            pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
        } else {
            pages.push(1, '...', state.currentPage - 1, state.currentPage, state.currentPage + 1, '...', totalPages);
        }
    }

    pagination.innerHTML = `
        <button class="page-btn" ${state.currentPage === 1 ? 'disabled' : ''} onclick="changePage(${state.currentPage - 1})">
            <i class="fas fa-chevron-left"></i>
        </button>
        ${pages.map(page => {
        if (page === '...') {
            return '<span class="page-ellipsis">...</span>';
        }
        return `
                <button class="page-btn ${page === state.currentPage ? 'active' : ''}" onclick="changePage(${page})">
                    ${page}
                </button>
            `;
    }).join('')}
        <button class="page-btn" ${state.currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${state.currentPage + 1})">
            <i class="fas fa-chevron-right"></i>
        </button>
    `;
}

function changePage(page) {
    state.currentPage = page;
    renderTable();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function changePerPage() {
    state.perPage = parseInt(document.getElementById('per-page-select').value);
    state.currentPage = 1;
    renderTable();
}

function updateResultsInfo() {
    const startIndex = (state.currentPage - 1) * state.perPage + 1;
    const endIndex = Math.min(startIndex + state.perPage - 1, state.totalItems);

    document.getElementById('results-info').textContent =
        `Mostrando ${startIndex}-${endIndex} de ${state.totalItems} resultados`;
}

// ==================== UTILIDADES ====================

function clearAllFilters() {
    state.filters = {
        categories: [],
        search: '',
        yearFrom: null,
        yearTo: null,
        composer: '',
        city: '',
        participant: ''
    };

    document.getElementById('search-input').value = '';
    document.getElementById('year-from').value = '';
    document.getElementById('year-to').value = '';
    document.getElementById('composer-filter').value = '';
    document.getElementById('city-filter').value = '';
    document.getElementById('participant-filter').value = '';

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    applyFilters();
}

function exportData() {
    const csv = convertToCSV(state.filteredData);
    downloadCSV(csv, `${state.currentTab}_export_${new Date().toISOString().slice(0, 10)}.csv`);
}

function convertToCSV(data) {
    if (!data.length) return '';

    const headers = Object.keys(data[0]).filter(h => h !== 'raw_data');
    const rows = data.map(obj =>
        headers.map(header => {
            const value = obj[header];
            if (typeof value === 'object') return JSON.stringify(value);
            return `"${String(value || '').replace(/"/g, '""')}"`;
        }).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
}

async function refreshData() {
    showLoading(true);
    showToast('Refrescando datos desde el servidor...', 'info');

    try {
        await loadDataFromAPI(false);
        showToast('Datos actualizados correctamente', 'success');
    } catch (error) {
        showError('Error al refrescar datos: ' + error.message);
    }
}

// ==================== UI FEEDBACK ====================

function showLoading(show) {
    document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

function showError(message) {
    console.error(message);
    showToast(message, 'error');
}

function showToast(message, type = 'info') {
    // Remover toast anterior si existe
    const existingToast = document.getElementById('toast-notification');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.className = `toast toast-${type}`;

    const icons = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
    };

    toast.innerHTML = `
        <i class="fas fa-${icons[type] || 'info-circle'}"></i>
        <span>${message}</span>
    `;

    document.body.appendChild(toast);

    // Animación de entrada
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto-remover después de 4 segundos
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Exponer funciones globalmente para onclick
window.toggleCategoryFilter = toggleCategoryFilter;
window.applyFilters = applyFilters;
window.clearAllFilters = clearAllFilters;
window.viewInGraph = viewInGraph;
window.editItem = editItem;
window.closeDetailsModal = closeDetailsModal;
window.sortBy = sortBy;
window.changePage = changePage;
window.changePerPage = changePerPage;
window.exportData = exportData;
window.refreshData = refreshData;
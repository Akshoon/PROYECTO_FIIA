// Web Worker for processing events into graph data or filtering existing graph data
'use strict';

self.onmessage = function (e) {
    console.log('Worker: Received message');

    const { events, nodes, links, filters } = e.data;

    try {
        if (events && Array.isArray(events)) {
            // Process events into graph data
            console.log('Worker: Processing', events.length, 'events into graph data');
            const result = processEventsToGraph(events, filters || {});
            console.log('Worker: Processed to', result.nodes.length, 'nodes and', result.links.length, 'links');
            self.postMessage({ nodes: result.nodes, links: result.links });
        } else if (nodes && links) {
            // Filter existing graph data
            console.log('Worker: Filtering', nodes.length, 'nodes and', links.length, 'links');
            const result = filterGraphData(nodes, links, filters || {});
            console.log('Worker: Filtered to', result.filteredNodes.length, 'nodes and', result.filteredLinks.length, 'links');
            self.postMessage({ nodes: result.filteredNodes, links: result.filteredLinks });
        } else {
            throw new Error('Invalid message format: expected events array or nodes/links arrays');
        }
    } catch (error) {
        console.error('Worker error:', error);
        self.postMessage({ error: error.message });
    }
};

function filterGraphData(nodes, links, filters) {
    filters = filters || {};

    // Check if any filter is active
    const hasFilters = filters.yearFrom || filters.yearTo || filters.global_q ||
        filters.composer_q || filters.participant_q || filters.location_q;

    if (!hasFilters) {
        return { filteredNodes: nodes, filteredLinks: links };
    }

    console.log('Worker: Applying filters:', filters);

    // Debug: check if nodes have year field
    const eventNodes = nodes.filter(n => n.type === 'event');
    console.log('Worker: Total event nodes:', eventNodes.length);

    const nodesWithYear = eventNodes.filter(n => n.year !== undefined && n.year !== null);
    console.log('Worker: Event nodes with year:', nodesWithYear.length);

    if (nodesWithYear.length > 0) {
        const sampleYears = nodesWithYear.slice(0, 5).map(n => n.year);
        console.log('Worker: Sample years:', sampleYears);
    }

    // Build a map of node IDs to nodes for quick lookup
    const nodeById = new Map();
    nodes.forEach(n => nodeById.set(n.id, n));

    // Build adjacency list for traversal
    const adjacency = new Map();
    nodes.forEach(n => adjacency.set(n.id, new Set()));
    links.forEach(l => {
        if (adjacency.has(l.source)) adjacency.get(l.source).add(l.target);
        if (adjacency.has(l.target)) adjacency.get(l.target).add(l.source);
    });

    const matchingNodeIds = new Set();

    // First pass: find nodes that match filters
    for (const node of nodes) {
        const label = (node.label || '').toLowerCase();
        const nodeType = node.type || '';

        // Year range filter - only applies to event nodes
        if ((filters.yearFrom || filters.yearTo) && nodeType === 'event') {
            const nodeYear = getYear(node); // ✅ USAR HELPER
            if (!isNaN(nodeYear)) {
                const From = parseInt(filters.yearFrom) || 0;
                const To = parseInt(filters.yearTo) || 3000;
                if (nodeYear >= From && nodeYear <= To) {
                    matchingNodeIds.add(node.id);
                    continue;
                }
            } else {
                // Si el evento no tiene año detectable, NO lo mostramos si hay filtro de año activado
                continue;
            }
        }

        // Global search - applies to all nodes
        if (filters.global_q) {
            if (label.includes(filters.global_q.toLowerCase())) {
                matchingNodeIds.add(node.id);
                continue;
            }
        }

        // If no primary filters matched, check specific fields
        if (!(filters.yearFrom || filters.yearTo || filters.global_q)) {
            let matches = false;

            // Event name filter
            if (filters.name_q && nodeType === 'event') {
                if (label.includes(filters.name_q.toLowerCase())) {
                    matches = true;
                }
            }

            // Composer filter
            if (filters.composer_q && nodeType === 'composer') {
                if (label.includes(filters.composer_q.toLowerCase())) {
                    matches = true;
                }
            }

            // Participant filter
            if (filters.participant_q && nodeType === 'participant') {
                if (label.includes(filters.participant_q.toLowerCase())) {
                    matches = true;
                }
            }

            // Piece filter
            if (filters.piece_q && nodeType === 'piece') {
                if (label.includes(filters.piece_q.toLowerCase())) {
                    matches = true;
                }
            }

            // Location filter
            if (filters.location_q && (nodeType === 'location' || nodeType === 'city')) {
                const filterLoc = filters.location_q.toLowerCase().trim();
                const nodeLabel = label.toLowerCase().trim();
                if (nodeLabel.includes(filterLoc)) {
                    matches = true;
                }
            }

            // Activity/Instrument filter
            if (filters.activity_q && nodeType === 'instrument') {
                if (label.includes(filters.activity_q.toLowerCase())) {
                    matches = true;
                }
            }



            if (matches) {
                matchingNodeIds.add(node.id);
            }
        }
    }

    console.log('Worker: Matching nodes after first pass:', matchingNodeIds.size);

    // If year range filter is set but no events matched, return empty
    if ((filters.yearFrom || filters.yearTo) && matchingNodeIds.size === 0) {
        return { filteredNodes: [], filteredLinks: [] };
    }

    // Expand for context (3 levels)
    // L1: Direct neighbors (e.g., Event -> Participant)
    // L2: Neighbors of neighbors (e.g., Participant -> Instrument)
    // L3: Third level (needed if we match Composer -> Piece -> Event -> Participant)
    const expandedIds = new Set(matchingNodeIds);

    // Level 1 expansion
    matchingNodeIds.forEach(nodeId => {
        const neighbors = adjacency.get(nodeId);
        if (neighbors) neighbors.forEach(n => expandedIds.add(n));
    });

    // Level 2 expansion
    const level1 = new Set(expandedIds);
    level1.forEach(nodeId => {
        const neighbors = adjacency.get(nodeId);
        if (neighbors) neighbors.forEach(n => expandedIds.add(n));
    });

    // Level 3 expansion
    const level2 = new Set(expandedIds);
    level2.forEach(nodeId => {
        const neighbors = adjacency.get(nodeId);
        if (neighbors) neighbors.forEach(n => expandedIds.add(n));
    });

    // ✅ NUEVO: Filtrado estricto final por año para eventos "resucitados" por expansión
    if (filters.yearFrom || filters.yearTo) {
        const from = parseInt(filters.yearFrom) || 0;
        const to = parseInt(filters.yearTo) || 3000;

        for (const id of expandedIds) {
            const node = nodeById.get(id);
            if (node && node.type === 'event') {
                const nodeYear = getYear(node); // ✅ USAR HELPER
                if (isNaN(nodeYear) || nodeYear < from || nodeYear > to) {
                    expandedIds.delete(id);
                }
            }
        }
    }

    // Filter nodes and links
    const filteredNodes = nodes.filter(n => expandedIds.has(n.id));
    const filteredLinks = links.filter(l => expandedIds.has(l.source) && expandedIds.has(l.target));

    console.log('Worker: Filter complete -', filteredNodes.length, 'nodes,', filteredLinks.length, 'links');
    return { filteredNodes, filteredLinks };
}

function processEventsToGraph(events, filters) {
    const nodes = [];
    const links = [];
    const nodeMap = new Map();
    const linkSet = new Set();

    // Apply event-level filters during processing
    let filteredEvents = events;

    if (filters.global_q) {
        const q = filters.global_q.toLowerCase();
        filteredEvents = filteredEvents.filter(e => {
            const participantsText = (e.participants || []).map(p => p.name).join(' ');
            const piecesText = (e.program || []).map(p => p.piece_name).join(' ');
            const composersText = (e.program || []).flatMap(p => p.composers || []).join(' ');
            const searchableText = `${e.name} ${e.location} ${e.composer} ${e.year} ${participantsText} ${piecesText} ${composersText}`.toLowerCase();
            return searchableText.includes(q);
        });
    }

    if (filters.participant_q) {
        const q = filters.participant_q.toLowerCase();
        filteredEvents = filteredEvents.filter(e =>
            e.participants && e.participants.some(p => p.name.toLowerCase().includes(q))
        );
    }

    if (filters.composer_q) {
        const q = filters.composer_q.toLowerCase();
        filteredEvents = filteredEvents.filter(e =>
            (e.composer && e.composer.toLowerCase().includes(q)) ||
            (e.program && e.program.some(piece =>
                (piece.composers && piece.composers.some(c => c.toLowerCase().includes(q))) ||
                (piece.piece_name && piece.piece_name.toLowerCase().includes(q))
            ))
        );
    }

    if (filters.location_q) {
        const q = filters.location_q.toLowerCase();
        filteredEvents = filteredEvents.filter(e => e.location && e.location.toLowerCase().includes(q));
    }

    if (filters.name_q) {
        const q = filters.name_q.toLowerCase();
        filteredEvents = filteredEvents.filter(e => e.name && e.name.toLowerCase().includes(q));
    }

    // ✅ NUEVO: Filtrar por año durante el procesamiento inicial
    if (filters.yearFrom || filters.yearTo) {
        const from = parseInt(filters.yearFrom) || 0;
        const to = parseInt(filters.yearTo) || 3000;
        filteredEvents = filteredEvents.filter(e => {
            const year = getYear(e); // ✅ USAR HELPER
            if (isNaN(year)) return false; // Ser estricto si hay filtro de año
            return year >= from && year <= to;
        });
    }

    if (filters.limit && filteredEvents.length > filters.limit) {
        filteredEvents = filteredEvents.slice(0, filters.limit);
    }

    console.log('Worker: Processing', filteredEvents.length, 'filtered events');

    for (const event of filteredEvents) {
        if (!event || (!event.id && !event.name)) continue;

        // Create event node with year stored
        const eventId = `event_${event.id || hashString(event.name || 'unknown')}`;
        const displayYear = event.year ? ` (${event.year})` : '';
        nodes.push({
            id: eventId,
            label: (event.name || 'Evento') + displayYear,
            type: 'event',
            year: event.year || null,
            eventData: event, // ✅ NUEVO: Guardar todo el objeto del evento
            x: Math.random() * 1000,
            y: Math.random() * 1000,
            size: 10
        });

        // Process participants
        const participants = event.participants || [];
        for (const participant of participants) {
            if (!participant || !participant.name) continue;

            const participantId = `participant_${hashString(participant.name)}`;
            if (!nodeMap.has(participantId)) {
                nodes.push({
                    id: participantId,
                    label: participant.name,
                    type: 'participant',
                    gender: participant.gender || null,
                    x: Math.random() * 1000,
                    y: Math.random() * 1000,
                    size: 8
                });
                nodeMap.set(participantId, true);
            }

            addLink(links, linkSet, eventId, participantId, 'interpretado por');

            // Extract instrument from activity
            const activity = participant.activity || '';
            if (activity && activity.includes(' - ')) {
                const instrument = activity.split(' - ')[1].trim();
                if (instrument && instrument !== 'Ninguno') {
                    const instrumentId = `instrument_${hashString(instrument)}`;
                    if (!nodeMap.has(instrumentId)) {
                        nodes.push({
                            id: instrumentId,
                            label: instrument,
                            type: 'instrument',
                            x: Math.random() * 1000,
                            y: Math.random() * 1000,
                            size: 6
                        });
                        nodeMap.set(instrumentId, true);
                    }
                    addLink(links, linkSet, participantId, instrumentId, 'toca');
                }
            }
        }

        // Process location
        const location = event.location || '';
        if (location) {
            const locationId = `location_${hashString(location)}`;
            if (!nodeMap.has(locationId)) {
                nodes.push({
                    id: locationId,
                    label: location,
                    type: 'location',
                    x: Math.random() * 1000,
                    y: Math.random() * 1000,
                    size: 7
                });
                nodeMap.set(locationId, true);
            }
            addLink(links, linkSet, eventId, locationId, 'en ubicación');
        }

        // Process program (pieces)
        const program = event.program || [];
        for (const piece of program) {
            if (!piece || !piece.piece_name) continue;

            const pieceId = `piece_${hashString(piece.piece_name)}`;
            if (!nodeMap.has(pieceId)) {
                nodes.push({
                    id: pieceId,
                    label: piece.piece_name,
                    type: 'piece',
                    x: Math.random() * 1000,
                    y: Math.random() * 1000,
                    size: 9
                });
                nodeMap.set(pieceId, true);
            }
            addLink(links, linkSet, eventId, pieceId, 'incluye obra');

            // Process composers
            const composers = piece.composers || [];
            for (const composerName of composers) {
                if (!composerName || composerName === 'Desconocido') continue;

                const composerId = `composer_${hashString(composerName)}`;
                if (!nodeMap.has(composerId)) {
                    nodes.push({
                        id: composerId,
                        label: composerName,
                        type: 'composer',
                        x: Math.random() * 1000,
                        y: Math.random() * 1000,
                        size: 8
                    });
                    nodeMap.set(composerId, true);
                }
                addLink(links, linkSet, pieceId, composerId, 'compuesta por');
            }

            // Process premiere type
            if (piece.premiere_type) {
                const premiereId = `premiere_${hashString(piece.premiere_type)}`;
                if (!nodeMap.has(premiereId)) {
                    nodes.push({
                        id: premiereId,
                        label: piece.premiere_type,
                        type: 'premiere_type',
                        x: Math.random() * 1000,
                        y: Math.random() * 1000,
                        size: 5
                    });
                    nodeMap.set(premiereId, true);
                }
                addLink(links, linkSet, pieceId, premiereId, 'tipo estreno');
            }
        }

        // Process event type
        if (event.event_type) {
            const eventTypeId = `event_type_${hashString(event.event_type)}`;
            if (!nodeMap.has(eventTypeId)) {
                nodes.push({
                    id: eventTypeId,
                    label: event.event_type,
                    type: 'event_type',
                    x: Math.random() * 1000,
                    y: Math.random() * 1000,
                    size: 5
                });
                nodeMap.set(eventTypeId, true);
            }
            addLink(links, linkSet, eventId, eventTypeId, 'tipo evento');
        }

        // Process cycle
        if (event.cycle && event.cycle !== 'Ninguno') {
            const cycleId = `cycle_${hashString(event.cycle)}`;
            if (!nodeMap.has(cycleId)) {
                nodes.push({
                    id: cycleId,
                    label: event.cycle,
                    type: 'cycle',
                    x: Math.random() * 1000,
                    y: Math.random() * 1000,
                    size: 5
                });
                nodeMap.set(cycleId, true);
            }
            addLink(links, linkSet, eventId, cycleId, 'parte de ciclo');
        }
    }

    return { nodes, links };
}

function addLink(links, linkSet, source, target, label) {
    const key = `${source}|${target}`;
    if (!linkSet.has(key)) {
        links.push({ source, target, label });
        linkSet.add(key);
    }
}

function hashString(str) {
    if (!str) return '0';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash).toString();
}

function getYear(nodeOrEvent) {
    if (!nodeOrEvent) return NaN;

    // 1. Try explicit year field
    if (nodeOrEvent.year) {
        const y = parseInt(nodeOrEvent.year);
        if (!isNaN(y)) return y;
    }

    // 2. Try to extract from date field (e.g. "1946-10-19" -> 1946)
    const date = nodeOrEvent.date || (nodeOrEvent.eventData && nodeOrEvent.eventData.date);
    if (date && typeof date === 'string') {
        const parts = date.split(/[-/]/);
        for (const part of parts) {
            if (part.length === 4) {
                const y = parseInt(part);
                if (!isNaN(y)) return y;
            }
        }
    }

    // 3. Try to extract from label (e.g. "Concierto (1954)" -> 1954)
    const label = nodeOrEvent.label;
    if (label && typeof label === 'string') {
        const match = label.match(/\((\d{4})\)/);
        if (match) return parseInt(match[1]);
    }

    return NaN;
}   
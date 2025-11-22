// Web Worker for processing events into graph data or filtering existing graph data
'use strict';

self.onmessage = function(e) {
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
    const hasFilters = filters.year || filters.composer_q || filters.participant_q || 
                       filters.piece_q || filters.name_q || filters.location_q ||
                       filters.activity_q || filters.gender_q;
    
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

        // Year filter - only applies to event nodes
        if (filters.year && nodeType === 'event') {
            const nodeYear = node.year;
            const filterYear = String(filters.year);
            
            // Check multiple possible formats for year
            if (nodeYear !== undefined && nodeYear !== null) {
                if (String(nodeYear) === filterYear) {
                    matchingNodeIds.add(node.id);
                    continue;
                }
            }
            
            // Also try to extract year from label if not in year field
            // Labels might be like "Concierto 2023" or contain the year
            if (label.includes(filterYear)) {
                matchingNodeIds.add(node.id);
                continue;
            }
        }

        // If no year filter, or this isn't an event, check other filters
        if (!filters.year || nodeType !== 'event') {
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
                if (label.includes(filters.location_q.toLowerCase())) {
                    matches = true;
                }
            }

            // Activity/Instrument filter
            if (filters.activity_q && nodeType === 'instrument') {
                if (label.includes(filters.activity_q.toLowerCase())) {
                    matches = true;
                }
            }

            // Gender filter
            if (filters.gender_q && nodeType === 'participant') {
                const nodeGender = node.gender || '';
                if (nodeGender.toLowerCase().includes(filters.gender_q.toLowerCase())) {
                    matches = true;
                }
            }

            if (matches) {
                matchingNodeIds.add(node.id);
            }
        }
    }

    console.log('Worker: Matching nodes after first pass:', matchingNodeIds.size);

    // If year filter is set but no events matched, return empty
    if (filters.year && matchingNodeIds.size === 0) {
        console.log('Worker: No events match year filter:', filters.year);
        console.log('Worker: This likely means nodes were loaded without year data.');
        console.log('Worker: Try clicking "Cargar Todo" to reload data with year information.');
        return { filteredNodes: [], filteredLinks: [] };
    }

    // Second pass: expand to include connected nodes (2 levels for better context)
    const expandedIds = new Set(matchingNodeIds);
    
    // First level expansion
    matchingNodeIds.forEach(nodeId => {
        const neighbors = adjacency.get(nodeId);
        if (neighbors) {
            neighbors.forEach(n => expandedIds.add(n));
        }
    });

    // Second level expansion (for connected context)
    const firstLevel = new Set(expandedIds);
    firstLevel.forEach(nodeId => {
        const neighbors = adjacency.get(nodeId);
        if (neighbors) {
            neighbors.forEach(n => expandedIds.add(n));
        }
    });

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

    if (filters.year) {
        const yearFilter = String(filters.year);
        filteredEvents = filteredEvents.filter(e => e.year && String(e.year) === yearFilter);
        console.log('Worker: Year filter applied, events:', filteredEvents.length);
    }

    if (filters.name_q) {
        const q = filters.name_q.toLowerCase();
        filteredEvents = filteredEvents.filter(e => e.name && e.name.toLowerCase().includes(q));
    }

    if (filters.limit && filteredEvents.length > filters.limit) {
        filteredEvents = filteredEvents.slice(0, filters.limit);
    }

    console.log('Worker: Processing', filteredEvents.length, 'filtered events');

    for (const event of filteredEvents) {
        if (!event || (!event.id && !event.name)) continue;

        // Create event node with year stored
        const eventId = `event_${event.id || hashString(event.name || 'unknown')}`;
        if (!nodeMap.has(eventId)) {
            nodes.push({
                id: eventId,
                label: event.name || 'Evento',
                type: 'event',
                year: event.year || null,  // Store year for filtering
                x: Math.random() * 1000,
                y: Math.random() * 1000,
                size: 10
            });
            nodeMap.set(eventId, true);
        }

        // Process participants
        const participants = event.participants || [];
        for (const participant of participants) {
            if (!participant || !participant.name) continue;

            // Apply participant filter
            if (filters.participant_q && 
                !participant.name.toLowerCase().includes(filters.participant_q.toLowerCase())) {
                continue;
            }

            const participantId = `participant_${hashString(participant.name)}`;
            if (!nodeMap.has(participantId)) {
                nodes.push({
                    id: participantId,
                    label: participant.name,
                    type: 'participant',
                    gender: participant.gender || null,  // Store gender for filtering
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
                    // Apply activity filter
                    if (filters.activity_q && 
                        !instrument.toLowerCase().includes(filters.activity_q.toLowerCase())) {
                        continue;
                    }

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
            // Apply location filter
            if (!filters.location_q || 
                location.toLowerCase().includes(filters.location_q.toLowerCase())) {
                
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
        }

        // Process program (pieces)
        const program = event.program || [];
        for (const piece of program) {
            if (!piece || !piece.piece_name) continue;

            // Apply piece filter
            if (filters.piece_q && 
                !piece.piece_name.toLowerCase().includes(filters.piece_q.toLowerCase())) {
                continue;
            }

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

                // Apply composer filter
                if (filters.composer_q && 
                    !composerName.toLowerCase().includes(filters.composer_q.toLowerCase())) {
                    continue;
                }

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
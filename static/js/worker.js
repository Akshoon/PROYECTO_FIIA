// Web Worker for processing events into graph data or filtering existing graph data
// This file should be placed at /static/js/worker.js

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
    // If no filters, return all data
    const hasFilters = filters.year || filters.composer_q || filters.participant_q || 
                       filters.piece_q || filters.name_q || filters.city_q;
    
    if (!hasFilters) {
        return { filteredNodes: nodes, filteredLinks: links };
    }

    const matchingNodeIds = new Set();

    // First pass: find nodes that match filters directly
    for (const node of nodes) {
        let matches = true;
        const label = (node.label || '').toLowerCase();

        switch (node.type) {
            case 'event':
                if (filters.name_q && !label.includes(filters.name_q.toLowerCase())) {
                    matches = false;
                }
                break;
            case 'composer':
                if (filters.composer_q && !label.includes(filters.composer_q.toLowerCase())) {
                    matches = false;
                }
                break;
            case 'participant':
                if (filters.participant_q && !label.includes(filters.participant_q.toLowerCase())) {
                    matches = false;
                }
                break;
            case 'piece':
                if (filters.piece_q && !label.includes(filters.piece_q.toLowerCase())) {
                    matches = false;
                }
                break;
            case 'city':
            case 'location':
                if (filters.city_q && !label.includes(filters.city_q.toLowerCase())) {
                    matches = false;
                }
                break;
            default:
                // Include other node types by default
                break;
        }

        if (matches) {
            matchingNodeIds.add(node.id);
        }
    }

    // Second pass: expand to include connected nodes (1 level)
    const expandedIds = new Set(matchingNodeIds);
    
    for (const link of links) {
        if (matchingNodeIds.has(link.source)) {
            expandedIds.add(link.target);
        }
        if (matchingNodeIds.has(link.target)) {
            expandedIds.add(link.source);
        }
    }

    // Filter nodes and links
    const filteredNodes = nodes.filter(n => expandedIds.has(n.id));
    const filteredLinks = links.filter(l => expandedIds.has(l.source) && expandedIds.has(l.target));

    return { filteredNodes, filteredLinks };
}

function processEventsToGraph(events, filters) {
    const nodes = [];
    const links = [];
    const nodeMap = new Map();
    const linkSet = new Set();

    // Apply event-level filters
    let filteredEvents = events;

    if (filters.year) {
        const year = parseInt(filters.year);
        filteredEvents = filteredEvents.filter(e => e.year === year);
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
        if (!event.id && !event.name) continue;

        // Create event node
        const eventId = `event_${event.id || hashString(event.name)}`;
        if (!nodeMap.has(eventId)) {
            nodes.push({
                id: eventId,
                label: event.name || 'Evento',
                type: 'event',
                x: Math.random() * 1000,
                y: Math.random() * 1000,
                size: 10
            });
            nodeMap.set(eventId, true);
        }

        // Process participants
        const participants = event.participants || [];
        for (const participant of participants) {
            if (!participant.name) continue;

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
                    x: Math.random() * 1000,
                    y: Math.random() * 1000,
                    size: 8
                });
                nodeMap.set(participantId, true);
            }

            addLink(links, linkSet, eventId, participantId, 'interpretado por');

            // Extract instrument from activity
            if (participant.activity && participant.activity.includes(' - ')) {
                const instrument = participant.activity.split(' - ')[1].trim();
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

        // Process location/city
        if (event.location) {
            const locationStr = event.location;
            let cityName = extractCityName(locationStr);

            if (cityName) {
                // Apply city filter
                if (!filters.city_q || cityName.toLowerCase().includes(filters.city_q.toLowerCase())) {
                    const cityId = `city_${hashString(cityName)}`;
                    if (!nodeMap.has(cityId)) {
                        nodes.push({
                            id: cityId,
                            label: cityName,
                            type: 'city',
                            x: Math.random() * 1000,
                            y: Math.random() * 1000,
                            size: 7
                        });
                        nodeMap.set(cityId, true);
                    }
                    addLink(links, linkSet, eventId, cityId, 'en ciudad');
                }
            }
        }

        // Process program (pieces)
        const program = event.program || [];
        for (const piece of program) {
            if (!piece.piece_name) continue;

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

function extractCityName(locationStr) {
    if (!locationStr) return null;
    
    // Try to extract from "Venue, City (Country)" format
    if (locationStr.includes('(') && locationStr.includes(')')) {
        const match = locationStr.match(/,\s*([^(]+)\s*\(/);
        if (match) return match[1].trim();
        
        // Try "City (Country)" format
        const cityMatch = locationStr.match(/^([^(]+)\s*\(/);
        if (cityMatch) return cityMatch[1].trim();
    }
    
    // Try comma-separated format
    if (locationStr.includes(', ')) {
        const parts = locationStr.split(', ');
        if (parts.length >= 2) {
            return parts[parts.length - 1].trim();
        }
    }
    
    return null;
}

function hashString(str) {
    if (!str) return '0';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString();
}
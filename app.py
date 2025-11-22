from flask import Flask, render_template, request, jsonify
import requests
import time
import json
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

API_BASE_URL = "http://basedeconciertos.uahurtado.cl:5099/api"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/monthly_ingestion', methods=['GET'])
def monthly_ingestion():
    print("Monthly ingestion endpoint called")
    try:
        all_events = []
        page = 1
        per_page = 1000

        while True:
            try:
                params = {'page': page, 'per_page': per_page}
                headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
                response = requests.get(f"{API_BASE_URL}/events", params=params, headers=headers, timeout=60)
                response.raise_for_status()
                data = response.json()
                events = data.get('events', [])
                if not events:
                    break
                all_events.extend(events)
                page += 1
                print(f"Fetched page {page-1}, total events: {len(all_events)}")
            except requests.RequestException as e:
                print(f"Error fetching page {page}: {e}")
                break

        params_data = extract_params_from_events(all_events)
        print("Processing events into graph format...")
        nodes, links = process_events_to_graph(all_events)
        print(f"Graph complete: {len(nodes)} nodes, {len(links)} links")

        return jsonify({
            'params': params_data,
            'events': all_events,
            'nodes': nodes,
            'links': links,
            'timestamp': int(time.time() * 1000)
        })
    except Exception as e:
        print(f"Error in monthly ingestion: {e}")
        return jsonify(get_fallback_data())

def get_fallback_data():
    """Return fallback sample data when API fails"""
    sample_events = [
        {
            'id': 1,
            'name': 'Concierto de Bach',
            'year': 1985,
            'location': 'Teatro Municipal, Santiago (Chile)',
            'event_type': 'Concierto',
            'cycle': 'Ciclo Clásico',
            'participants': [
                {'name': 'Juan Pérez', 'activity': 'Pianista - Piano'},
                {'name': 'María González', 'activity': 'Violinista - Violin'}
            ],
            'program': [
                {'piece_name': 'Concierto para Piano No. 1', 'composers': ['Bach'], 'premiere_type': 'Estreno Mundial'}
            ]
        },
        {
            'id': 2,
            'name': 'Sinfonía de Beethoven',
            'year': 1986,
            'location': 'Sala de Conciertos, Valparaíso (Chile)',
            'event_type': 'Sinfonía',
            'cycle': 'Ciclo Romántico',
            'participants': [
                {'name': 'Carlos Rodríguez', 'activity': 'Director - Orquesta'},
                {'name': 'Ana López', 'activity': 'Violonchelista - Cello'}
            ],
            'program': [
                {'piece_name': 'Sinfonía No. 5', 'composers': ['Beethoven'], 'premiere_type': 'Estreno Nacional'}
            ]
        }
    ]
    
    nodes, links = process_events_to_graph(sample_events)
    return {
        'params': extract_params_from_events(sample_events),
        'events': sample_events,
        'nodes': nodes,
        'links': links,
        'timestamp': int(time.time() * 1000)
    }

def extract_params_from_events(events):
    """Extract unique parameters from events data"""
    composers, cities, instruments = set(), set(), set()
    event_types, cycles, premiere_types = set(), set(), set()

    for event in events:
        for piece in event.get('program', []):
            for composer in piece.get('composers', []):
                if composer and composer != 'Desconocido':
                    composers.add(composer)
            if piece.get('premiere_type'):
                premiere_types.add(piece['premiere_type'])

        city = extract_city_name(event.get('location', ''))
        if city:
            cities.add(city)

        for participant in event.get('participants', []):
            activity = participant.get('activity', '')
            if ' - ' in activity:
                instrument = activity.split(' - ')[1].strip()
                if instrument and instrument != 'Ninguno':
                    instruments.add(instrument)

        if event.get('event_type'):
            event_types.add(event['event_type'])
        if event.get('cycle') and event['cycle'] != 'Ninguno':
            cycles.add(event['cycle'])

    return {
        'composers': [{'id': i+1, 'name': n} for i, n in enumerate(sorted(composers))],
        'cities': [{'id': i+1, 'name': n} for i, n in enumerate(sorted(cities))],
        'instruments': [{'id': i+1, 'name': n} for i, n in enumerate(sorted(instruments))],
        'event_types': [{'id': i+1, 'name': n} for i, n in enumerate(sorted(event_types))],
        'cycles': [{'id': i+1, 'name': n} for i, n in enumerate(sorted(cycles))],
        'premiere_types': [{'id': i+1, 'name': n} for i, n in enumerate(sorted(premiere_types))]
    }

def extract_city_name(location_str):
    """Extract city name from location string"""
    if not location_str:
        return None
    
    # Format: "Venue, City (Country)"
    if '(' in location_str and ')' in location_str:
        import re
        match = re.search(r',\s*([^(]+)\s*\(', location_str)
        if match:
            return match.group(1).strip()
        # Format: "City (Country)"
        match = re.search(r'^([^(]+)\s*\(', location_str)
        if match:
            return match.group(1).strip()
    
    # Comma-separated format
    if ', ' in location_str:
        parts = location_str.split(', ')
        if len(parts) >= 2:
            return parts[-1].strip()
    
    return None

@app.route('/api/proxy/events', methods=['GET'])
def proxy_events():
    """Proxy endpoint to avoid CORS issues"""
    try:
        params = request.args.to_dict()
        print(f"Proxy: request params: {params}")
        
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        response = requests.get(f"{API_BASE_URL}/events", params=params, headers=headers, timeout=30)
        
        print(f"Proxy: response status: {response.status_code}")
        
        if response.status_code != 200:
            return jsonify({'error': f'API returned {response.status_code}'}), response.status_code

        data = response.json()
        print(f"Proxy: received {len(data.get('events', []))} events")
        return jsonify(data)

    except requests.RequestException as e:
        print(f"Proxy error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/default_data', methods=['GET'])
def default_data():
    """Serve default data from JSON file"""
    try:
        with open('concert_data_20251117_202521.json', 'r', encoding='utf-8') as f:
            return jsonify(json.load(f))
    except FileNotFoundError:
        return jsonify({'error': 'Default data file not found'}), 404
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid JSON'}), 500

@app.route('/api/graph_data', methods=['GET'])
def graph_data():
    """Get graph data with filters"""
    filter_params = ['name_q', 'composer_q', 'participant_q', 'piece_q', 'activity_q', 
                     'gender_q', 'year', 'city_q', 'city_id', 'location_id', 'event_type_id',
                     'cycle_id', 'organization_id', 'instrument_id', 'ensemble_id', 
                     'premiere_type_id', 'composer_id', 'participant_id']
    
    params = {p: request.args.get(p) for p in filter_params if request.args.get(p)}
    max_events = int(request.args.get('limit', 500))

    try:
        all_events = fetch_paginated_events(params, max_events)
        print(f"Total events fetched: {len(all_events)}")

        nodes, links = process_events_to_graph(all_events)
        print(f"Graph: {len(nodes)} nodes, {len(links)} links")
        
        return jsonify({'nodes': nodes, 'links': links})
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500

def fetch_paginated_events(params, max_events):
    """Fetch events with pagination"""
    all_events = []
    page = 1
    per_page = min(100, max_events)
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

    while len(all_events) < max_events:
        params['page'] = page
        params['per_page'] = per_page
        
        response = requests.get(f"{API_BASE_URL}/events", params=params, headers=headers, timeout=30)
        response.raise_for_status()
        
        events = response.json().get('events', [])
        if not events:
            break
            
        all_events.extend(events)
        if len(events) < per_page:
            break
        page += 1

    return all_events[:max_events]

def process_events_to_graph(events):
    """Process events into graph nodes and links"""
    nodes = []
    links = []
    node_ids = set()

    for event in events:
        event_id = f"event_{event.get('id', hash_string(event.get('name', 'unknown')))}"
        
        if event_id not in node_ids:
            nodes.append({
                'id': event_id,
                'label': event.get('name', 'Evento'),
                'type': 'event',
                'x': 0,
                'y': 0,
                'size': 10
            })
            node_ids.add(event_id)

        # Process participants
        for participant in event.get('participants', []):
            name = participant.get('name')
            if not name:
                continue

            p_id = f"participant_{hash_string(name)}"
            if p_id not in node_ids:
                nodes.append({
                    'id': p_id,
                    'label': name,
                    'type': 'participant',
                    'x': 0, 'y': 0,
                    'size': 8
                })
                node_ids.add(p_id)
            links.append({'source': event_id, 'target': p_id, 'label': 'interpretado por'})

            # Extract instrument
            activity = participant.get('activity', '')
            if ' - ' in activity:
                instrument = activity.split(' - ')[1].strip()
                if instrument and instrument != 'Ninguno':
                    i_id = f"instrument_{hash_string(instrument)}"
                    if i_id not in node_ids:
                        nodes.append({
                            'id': i_id,
                            'label': instrument,
                            'type': 'instrument',
                            'x': 0, 'y': 0,
                            'size': 6
                        })
                        node_ids.add(i_id)
                    links.append({'source': p_id, 'target': i_id, 'label': 'toca'})

        # Process location/city
        location = event.get('location', '')
        if location:
            city = extract_city_name(location)
            if city:
                c_id = f"city_{hash_string(city)}"
                if c_id not in node_ids:
                    nodes.append({
                        'id': c_id,
                        'label': city,
                        'type': 'city',
                        'x': 0, 'y': 0,
                        'size': 7
                    })
                    node_ids.add(c_id)
                links.append({'source': event_id, 'target': c_id, 'label': 'en ciudad'})

        # Process event type
        if event.get('event_type'):
            et_id = f"event_type_{hash_string(event['event_type'])}"
            if et_id not in node_ids:
                nodes.append({
                    'id': et_id,
                    'label': event['event_type'],
                    'type': 'event_type',
                    'x': 0, 'y': 0,
                    'size': 5
                })
                node_ids.add(et_id)
            links.append({'source': event_id, 'target': et_id, 'label': 'tipo evento'})

        # Process cycle
        cycle = event.get('cycle')
        if cycle and cycle != 'Ninguno':
            cy_id = f"cycle_{hash_string(cycle)}"
            if cy_id not in node_ids:
                nodes.append({
                    'id': cy_id,
                    'label': cycle,
                    'type': 'cycle',
                    'x': 0, 'y': 0,
                    'size': 5
                })
                node_ids.add(cy_id)
            links.append({'source': event_id, 'target': cy_id, 'label': 'parte de ciclo'})

        # Process pieces
        for piece in event.get('program', []):
            piece_name = piece.get('piece_name')
            if not piece_name:
                continue

            pi_id = f"piece_{hash_string(piece_name)}"
            if pi_id not in node_ids:
                nodes.append({
                    'id': pi_id,
                    'label': piece_name,
                    'type': 'piece',
                    'x': 0, 'y': 0,
                    'size': 9
                })
                node_ids.add(pi_id)
            links.append({'source': event_id, 'target': pi_id, 'label': 'incluye obra'})

            # Process composers
            for composer in piece.get('composers', []):
                if not composer or composer == 'Desconocido':
                    continue
                co_id = f"composer_{hash_string(composer)}"
                if co_id not in node_ids:
                    nodes.append({
                        'id': co_id,
                        'label': composer,
                        'type': 'composer',
                        'x': 0, 'y': 0,
                        'size': 8
                    })
                    node_ids.add(co_id)
                links.append({'source': pi_id, 'target': co_id, 'label': 'compuesta por'})

            # Process premiere type
            premiere = piece.get('premiere_type')
            if premiere:
                pr_id = f"premiere_{hash_string(premiere)}"
                if pr_id not in node_ids:
                    nodes.append({
                        'id': pr_id,
                        'label': premiere,
                        'type': 'premiere_type',
                        'x': 0, 'y': 0,
                        'size': 5
                    })
                    node_ids.add(pr_id)
                links.append({'source': pi_id, 'target': pr_id, 'label': 'tipo estreno'})

    return nodes, links

def hash_string(s):
    """Generate consistent hash for string IDs"""
    if not s:
        return '0'
    h = 0
    for char in s:
        h = ((h << 5) - h) + ord(char)
        h &= 0xFFFFFFFF  # Keep as 32-bit unsigned
    return str(h)

if __name__ == "__main__":
    app.run(debug=True)
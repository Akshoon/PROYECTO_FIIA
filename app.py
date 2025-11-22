from flask import Flask, render_template, request, jsonify
import requests
import time
import json
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

API_BASE_URL = "http://basedeconciertos.uahurtado.cl:5099/api"
PARAMS_URL = "http://basedeconciertos.uahurtado.cl:5099/api/status/get_params"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/test-db')
def test_db():
    """Página de prueba para verificar IndexedDB"""
    return render_template('test-db.html')

@app.route('/api/get_params', methods=['GET'])
def get_params():
    """Fetch all available filter parameters from the API"""
    try:
        full_content = request.args.get('full_content', 'true')
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        response = requests.get(f"{PARAMS_URL}?full_content={full_content}", headers=headers, timeout=30)
        response.raise_for_status()
        return jsonify(response.json())
    except requests.RequestException as e:
        print(f"Error fetching params: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/get_all_filter_values', methods=['GET'])
def get_all_filter_values():
    """
    Extrae TODOS los valores posibles para cada parámetro de filtro.
    Esto consulta la API con full_content=true y además hace peticiones
    adicionales si es necesario para obtener listas completas.
    """
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        
        # Obtener parámetros base
        params_response = requests.get(f"{PARAMS_URL}?full_content=true", headers=headers, timeout=30)
        params_response.raise_for_status()
        params_data = params_response.json()
        
        # Estructura para almacenar todos los valores
        all_values = {
            'composers': [],
            'participants': [],
            'cities': [],
            'locations': [],
            'instruments': [],
            'event_types': [],
            'cycles': [],
            'organizations': [],
            'ensembles': [],
            'premiere_types': [],
            'activities': [],
            'genders': [],
            'years': list(range(1945, 1996))  # Rango conocido
        }
        
        # Si la API devuelve valores directamente, usarlos
        if isinstance(params_data, dict):
            for key in all_values.keys():
                if key in params_data and isinstance(params_data[key], list):
                    all_values[key] = params_data[key]
                    print(f"Loaded {len(params_data[key])} {key} from params")
        
        # Extraer valores adicionales desde eventos si es necesario
        print("Fetching sample events to extract additional values...")
        events_response = requests.get(
            f"{API_BASE_URL}/events", 
            params={'page': 1, 'per_page': 100},
            headers=headers,
            timeout=30
        )
        
        if events_response.status_code == 200:
            events_data = events_response.json()
            events = events_data.get('events', [])
            
            # Extraer valores únicos de los eventos
            extracted = extract_unique_values_from_events(events)
            
            # Combinar con valores existentes (sin duplicados)
            for key, values in extracted.items():
                if key in all_values:
                    existing_ids = {item['id'] for item in all_values[key] if isinstance(item, dict)}
                    for value in values:
                        if isinstance(value, dict) and value.get('id') not in existing_ids:
                            all_values[key].append(value)
        
        # Asegurar que todo esté en el formato correcto {id, name}
        for key in all_values.keys():
            if key == 'years':
                continue
            all_values[key] = normalize_values(all_values[key])
        
        return jsonify({
            'success': True,
            'data': all_values,
            'timestamp': int(time.time() * 1000),
            'counts': {k: len(v) for k, v in all_values.items()}
        })
        
    except requests.RequestException as e:
        print(f"Error fetching filter values: {e}")
        return jsonify({'error': str(e), 'success': False}), 500
    except Exception as e:
        print(f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e), 'success': False}), 500

def extract_unique_values_from_events(events):
    """Extrae valores únicos de una lista de eventos"""
    composers = {}
    participants = {}
    cities = {}
    locations = {}
    instruments = {}
    event_types = {}
    cycles = {}
    premiere_types = {}
    activities = {}
    genders = {}
    
    for event in events:
        if not isinstance(event, dict):
            continue
        
        # Event types
        if event.get('event_type'):
            et = event['event_type']
            event_types[et] = {'name': et}
        
        # Cycles
        if event.get('cycle') and event['cycle'] != 'Ninguno':
            cy = event['cycle']
            cycles[cy] = {'name': cy}
        
        # Locations
        if event.get('location'):
            loc = event['location']
            locations[loc] = {'name': loc}
            
            # Extract city
            city = extract_city_name(loc)
            if city:
                cities[city] = {'name': city}
        
        # Participants
        for participant in event.get('participants', []):
            if not isinstance(participant, dict):
                continue
            
            name = participant.get('name')
            if name:
                participants[name] = {'name': name}
            
            # Gender
            gender = participant.get('gender')
            if gender:
                genders[gender] = {'name': gender}
            
            # Activity and instrument
            activity = participant.get('activity', '')
            if activity:
                activities[activity] = {'name': activity}
                
                if ' - ' in activity:
                    instrument = activity.split(' - ')[1].strip()
                    if instrument and instrument != 'Ninguno':
                        instruments[instrument] = {'name': instrument}
        
        # Program (pieces and composers)
        for piece in event.get('program', []):
            if not isinstance(piece, dict):
                continue
            
            # Premiere types
            premiere = piece.get('premiere_type')
            if premiere:
                premiere_types[premiere] = {'name': premiere}
            
            # Composers
            for composer in piece.get('composers', []):
                if composer and composer != 'Desconocido':
                    composers[composer] = {'name': composer}
    
    # Convert to lists with IDs
    return {
        'composers': [{'id': hash_string(k), 'name': k} for k in composers.keys()],
        'participants': [{'id': hash_string(k), 'name': k} for k in participants.keys()],
        'cities': [{'id': hash_string(k), 'name': k} for k in cities.keys()],
        'locations': [{'id': hash_string(k), 'name': k} for k in locations.keys()],
        'instruments': [{'id': hash_string(k), 'name': k} for k in instruments.keys()],
        'event_types': [{'id': hash_string(k), 'name': k} for k in event_types.keys()],
        'cycles': [{'id': hash_string(k), 'name': k} for k in cycles.keys()],
        'premiere_types': [{'id': hash_string(k), 'name': k} for k in premiere_types.keys()],
        'activities': [{'id': hash_string(k), 'name': k} for k in activities.keys()],
        'genders': [{'id': hash_string(k), 'name': k} for k in genders.keys()],
    }

def normalize_values(values):
    """Normaliza valores al formato {id, name}"""
    normalized = []
    seen_names = set()
    
    for item in values:
        if isinstance(item, dict):
            name = item.get('name', '')
            if name and name not in seen_names:
                normalized.append({
                    'id': item.get('id', hash_string(name)),
                    'name': name
                })
                seen_names.add(name)
        elif isinstance(item, str) and item not in seen_names:
            normalized.append({
                'id': hash_string(item),
                'name': item
            })
            seen_names.add(item)
    
    return sorted(normalized, key=lambda x: x['name'])

@app.route('/api/monthly_ingestion', methods=['GET'])
def monthly_ingestion():
    print("Monthly ingestion endpoint called")
    try:
        # First, fetch all available parameters
        print("Fetching API parameters...")
        api_params = fetch_api_params()
        print(f"API params fetched: {list(api_params.keys()) if api_params else 'None'}")
        
        # Then fetch all events
        all_events = []
        page = 1
        per_page = 100

        while True:
            try:
                params = {'page': page, 'per_page': per_page}
                headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
                response = requests.get(f"{API_BASE_URL}/events", params=params, headers=headers, timeout=60)
                response.raise_for_status()
                data = response.json()
                events = data.get('events') or []
                if not events:
                    break
                all_events.extend(events)
                page += 1
                print(f"Fetched page {page-1}, total events: {len(all_events)}")
            except requests.RequestException as e:
                print(f"Error fetching page {page}: {e}")
                break

        print(f"Total events fetched: {len(all_events)}")
        
        # Extract params from events as fallback/supplement
        print("Extracting params from events...")
        try:
            extracted_params = extract_params_from_events(all_events)
            # Merge API params with extracted params
            if api_params:
                merged_params = merge_params(api_params, extracted_params)
            else:
                merged_params = extracted_params
            print(f"Params ready: {len(merged_params.get('composers', []))} composers, {len(merged_params.get('cities', []))} cities")
        except Exception as e:
            print(f"Error extracting params: {e}")
            import traceback
            traceback.print_exc()
            merged_params = api_params or {'composers': [], 'cities': [], 'instruments': [], 'event_types': [], 'cycles': [], 'premiere_types': []}

        # Process events to graph
        print("Processing events into graph format...")
        try:
            nodes, links = process_events_to_graph(all_events)
            print(f"Graph complete: {len(nodes)} nodes, {len(links)} links")
        except Exception as e:
            print(f"Error processing graph: {e}")
            import traceback
            traceback.print_exc()
            nodes, links = [], []

        return jsonify({
            'params': merged_params,
            'events': all_events[:1000],
            'nodes': nodes,
            'links': links,
            'total_events': len(all_events),
            'timestamp': int(time.time() * 1000)
        })
    except Exception as e:
        print(f"Error in monthly ingestion: {e}")
        import traceback
        traceback.print_exc()
        return jsonify(get_fallback_data())

def fetch_api_params():
    """Fetch all available parameters from the API"""
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        url = f"{PARAMS_URL}?full_content=true"
        print(f"Fetching params from: {url}")
        
        response = requests.get(url, headers=headers, timeout=30)
        print(f"Params response status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"Params request failed with status {response.status_code}")
            return None
            
        data = response.json()
        print(f"Params response type: {type(data)}")
        print(f"Params response keys: {list(data.keys()) if isinstance(data, dict) else 'not a dict'}")
        
        # The API might return data directly or nested
        params = {}
        
        if isinstance(data, dict):
            # Check for direct format: {'composers': [...], 'cities': [...], ...}
            direct_keys = ['composers', 'cities', 'instruments', 'event_types', 'cycles', 
                          'premiere_types', 'locations', 'organizations', 'ensembles', 
                          'genders', 'activities']
            
            for key in direct_keys:
                if key in data:
                    params[key] = data[key]
                    print(f"Found {key}: {len(data[key]) if isinstance(data[key], list) else 'not a list'} items")
            
            # Check for nested 'parameters' format
            if 'parameters' in data and isinstance(data['parameters'], list):
                print(f"Found nested parameters: {len(data['parameters'])} items")
                for param in data['parameters']:
                    if isinstance(param, dict):
                        param_name = param.get('name', '')
                        if 'values' in param:
                            params[param_name] = param['values']
            
            # If params is still empty, maybe the whole response is the params
            if not params and data:
                params = data
                print("Using entire response as params")
        
        if params:
            print(f"Successfully fetched params with keys: {list(params.keys())}")
            return params
        else:
            print("No params found in response")
            return None
            
    except requests.RequestException as e:
        print(f"Request error fetching API params: {e}")
        return None
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}")
        return None
    except Exception as e:
        print(f"Unexpected error fetching API params: {e}")
        import traceback
        traceback.print_exc()
        return None

def merge_params(api_params, extracted_params):
    """Merge API params with extracted params, preferring API params"""
    merged = {}
    
    all_keys = set(list(api_params.keys()) + list(extracted_params.keys()))
    
    for key in all_keys:
        api_values = api_params.get(key, [])
        extracted_values = extracted_params.get(key, [])
        
        # Use API values if available, otherwise extracted
        if api_values:
            merged[key] = api_values
        else:
            merged[key] = extracted_values
    
    return merged

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
        if not event or not isinstance(event, dict):
            continue
            
        # Process program/pieces
        program = event.get('program')
        if program and isinstance(program, list):
            for piece in program:
                if not piece or not isinstance(piece, dict):
                    continue
                    
                # Get composers
                piece_composers = piece.get('composers')
                if piece_composers and isinstance(piece_composers, list):
                    for composer in piece_composers:
                        if composer and isinstance(composer, str) and composer != 'Desconocido':
                            composers.add(composer)
                
                # Get premiere type
                premiere = piece.get('premiere_type')
                if premiere and isinstance(premiere, str):
                    premiere_types.add(premiere)

        # Get city from location
        location = event.get('location')
        if location and isinstance(location, str):
            city = extract_city_name(location)
            if city:
                cities.add(city)

        # Process participants for instruments
        participants = event.get('participants')
        if participants and isinstance(participants, list):
            for participant in participants:
                if not participant or not isinstance(participant, dict):
                    continue
                activity = participant.get('activity')
                if activity and isinstance(activity, str) and ' - ' in activity:
                    parts = activity.split(' - ')
                    if len(parts) >= 2:
                        instrument = parts[1].strip()
                        if instrument and instrument != 'Ninguno':
                            instruments.add(instrument)

        # Get event type
        event_type = event.get('event_type')
        if event_type and isinstance(event_type, str):
            event_types.add(event_type)
        
        # Get cycle
        cycle = event.get('cycle')
        if cycle and isinstance(cycle, str) and cycle != 'Ninguno':
            cycles.add(cycle)

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
    if not location_str or not isinstance(location_str, str):
        return None
    
    try:
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
    except Exception as e:
        print(f"Error extracting city from '{location_str}': {e}")
    
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
        if not event:
            continue
            
        # Get event ID safely
        event_raw_id = event.get('id') or hash_string(event.get('name') or 'unknown')
        event_id = f"event_{event_raw_id}"
        
        if event_id not in node_ids:
            nodes.append({
                'id': event_id,
                'label': event.get('name') or 'Evento',
                'type': 'event',
                'x': 0,
                'y': 0,
                'size': 10
            })
            node_ids.add(event_id)

        # Process participants (safely handle None)
        participants = event.get('participants') or []
        for participant in participants:
            if not participant:
                continue
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
            activity = participant.get('activity') or ''
            if activity and ' - ' in activity:
                parts = activity.split(' - ')
                if len(parts) >= 2:
                    instrument = parts[1].strip()
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
        location = event.get('location') or ''
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
        event_type = event.get('event_type')
        if event_type:
            et_id = f"event_type_{hash_string(event_type)}"
            if et_id not in node_ids:
                nodes.append({
                    'id': et_id,
                    'label': event_type,
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

        # Process pieces (safely handle None)
        program = event.get('program') or []
        for piece in program:
            if not piece:
                continue
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

            # Process composers (safely handle None)
            composers = piece.get('composers') or []
            for composer in composers:
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
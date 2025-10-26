from flask import Flask, render_template, request, jsonify
import requests

app = Flask(__name__)

API_BASE_URL = "http://basedeconciertos.uahurtado.cl:5099/api"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/graph_data', methods=['GET'])
def graph_data():
    # Obtener parámetros de búsqueda desde la solicitud
    params = {}
    for param in ['name_q', 'composer_q', 'participant_q', 'piece_q', 'activity_q', 'gender_q', 'year', 'city_q', 'city_id', 'location_id', 'event_type_id', 'cycle_id', 'organization_id', 'instrument_id', 'ensemble_id', 'premiere_type_id', 'composer_id', 'participant_id']:
        value = request.args.get(param)
        if value:
            params[param] = value

    # Limitar el número de eventos para evitar sobrecarga (como en Nodegoat)
    max_events = int(request.args.get('limit', 500))  # Límite por defecto de 500 eventos

    # Llamar a la API externa para obtener eventos con paginación y límite
    try:
        all_events = []
        page = 1
        per_page = min(100, max_events)  # Máximo 100 por página, pero no más que el límite
        while len(all_events) < max_events:
            params['page'] = page
            params['per_page'] = per_page
            print(f"Making request to: {API_BASE_URL}/events with params: {params}")  # Debug
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
            response = requests.get(f"{API_BASE_URL}/events", params=params, headers=headers, timeout=30)  # Timeout reducido
            print(f"Response status: {response.status_code}")  # Debug
            response.raise_for_status()
            data = response.json()
            events = data.get('events', [])
            print(f"Events in this page: {len(events)}")  # Debug
            if not events:
                break
            all_events.extend(events)
            if len(events) < per_page or len(all_events) >= max_events:
                break
            page += 1

        # Limitar la lista a max_events
        all_events = all_events[:max_events]
        print(f"Total events fetched (limited): {len(all_events)}")  # Debug: imprimir total de eventos

        # Procesar datos para grafo: nodos y edges
        nodes = []
        edges = []
        node_ids = set()

        for event in all_events:
            event_id = f"event_{event['id']}"
            if event_id not in node_ids:
                nodes.append({
                    'data': {
                        'id': event_id,
                        'label': event.get('name', 'Evento'),
                        'type': 'event'
                    }
                })
                node_ids.add(event_id)

            # Relaciones con participantes
            for participant in event.get('participants', []):
                if 'name' in participant and participant['name']:
                    participant_id = f"participant_{hash(participant['name'])}"  # Usar hash para ID único
                    if participant_id not in node_ids:
                        nodes.append({
                            'data': {
                                'id': participant_id,
                                'label': participant['name'],
                                'type': 'participant'
                            }
                        })
                        node_ids.add(participant_id)
                    edges.append({
                        'data': {
                            'source': event_id,
                            'target': participant_id,
                            'label': 'interpretado por'
                        }
                    })

                    # Extraer instrumento de la actividad si está presente
                    if 'activity' in participant and participant['activity']:
                        activity = participant['activity']
                        # Intentar extraer instrumento de la actividad (e.g., "Pianista - Piano")
                        if ' - ' in activity:
                            instrument_name = activity.split(' - ')[1].strip()
                            if instrument_name and instrument_name != 'Ninguno':
                                instrument_id = f"instrument_{hash(instrument_name)}"
                                if instrument_id not in node_ids:
                                    nodes.append({
                                        'data': {
                                            'id': instrument_id,
                                            'label': instrument_name,
                                            'type': 'instrument'
                                        }
                                    })
                                    node_ids.add(instrument_id)
                                edges.append({
                                    'data': {
                                        'source': participant_id,
                                        'target': instrument_id,
                                        'label': 'toca instrumento'
                                    }
                                })

            # Relaciones con locaciones (extraer ciudad si es posible)
            if 'location' in event and event['location']:
                location_str = event['location']
                # Intentar extraer ciudad de la cadena de location (e.g., "Teatro Municipal, Santiago (Chile)")
                city_name = None
                if '(' in location_str and ')' in location_str:
                    city_part = location_str.split('(')[-1].split(')')[0].strip()
                    if 'Chile' in city_part:
                        city_name = city_part.replace('(Chile)', '').strip()
                    else:
                        city_name = city_part
                elif ', ' in location_str:
                    parts = location_str.split(', ')
                    if len(parts) > 1:
                        city_name = parts[-1].strip()

                if city_name:
                    city_id = f"city_{hash(city_name)}"
                    if city_id not in node_ids:
                        nodes.append({
                            'data': {
                                'id': city_id,
                                'label': city_name,
                                'type': 'city'
                            }
                        })
                        node_ids.add(city_id)
                    edges.append({
                        'data': {
                            'source': event_id,
                            'target': city_id,
                            'label': 'en ciudad'
                        }
                    })

                # Crear nodo para la locación completa
                location_id = f"location_{hash(location_str)}"
                if location_id not in node_ids:
                    nodes.append({
                        'data': {
                            'id': location_id,
                            'label': location_str,
                            'type': 'location'
                        }
                    })
                    node_ids.add(location_id)
                edges.append({
                    'data': {
                        'source': event_id,
                        'target': location_id,
                        'label': 'en locación'
                    }
                })

            # Relaciones con tipos de evento
            if 'event_type' in event and event['event_type']:
                event_type_str = event['event_type']
                event_type_id = f"event_type_{hash(event_type_str)}"
                if event_type_id not in node_ids:
                    nodes.append({
                        'data': {
                            'id': event_type_id,
                            'label': event_type_str,
                            'type': 'event_type'
                        }
                    })
                    node_ids.add(event_type_id)
                edges.append({
                    'data': {
                        'source': event_id,
                        'target': event_type_id,
                        'label': 'tipo de evento'
                    }
                })

            # Relaciones con ciclos
            if 'cycle' in event and event['cycle'] and event['cycle'] != 'Ninguno':
                cycle_str = event['cycle']
                cycle_id = f"cycle_{hash(cycle_str)}"
                if cycle_id not in node_ids:
                    nodes.append({
                        'data': {
                            'id': cycle_id,
                            'label': cycle_str,
                            'type': 'cycle'
                        }
                    })
                    node_ids.add(cycle_id)
                edges.append({
                    'data': {
                        'source': event_id,
                        'target': cycle_id,
                        'label': 'parte de ciclo'
                    }
                })

            # Relaciones con obras (pieces)
            for piece in event.get('program', []):
                if 'piece_name' in piece and piece['piece_name'] and 'composers' in piece:
                    piece_id = f"piece_{hash(piece['piece_name'])}"  # Usar hash ya que no hay ID único
                    if piece_id not in node_ids:
                        nodes.append({
                            'data': {
                                'id': piece_id,
                                'label': piece['piece_name'],
                                'type': 'piece'
                            }
                        })
                        node_ids.add(piece_id)
                    edges.append({
                        'data': {
                            'source': event_id,
                            'target': piece_id,
                            'label': 'incluye obra'
                        }
                    })

                    # Relaciones entre piezas y compositores
                    for composer_name in piece['composers']:
                        if composer_name and composer_name != 'Desconocido':
                            composer_id = f"composer_{hash(composer_name)}"  # Usar hash para ID único
                            if composer_id not in node_ids:
                                nodes.append({
                                    'data': {
                                        'id': composer_id,
                                        'label': composer_name,
                                        'type': 'composer'
                                    }
                                })
                                node_ids.add(composer_id)
                            edges.append({
                                'data': {
                                    'source': piece_id,
                                    'target': composer_id,
                                    'label': 'compuesta por'
                                }
                            })

                    # Relaciones con tipos de estreno
                    if 'premiere_type' in piece and piece['premiere_type']:
                        premiere_type_str = piece['premiere_type']
                        premiere_type_id = f"premiere_type_{hash(premiere_type_str)}"
                        if premiere_type_id not in node_ids:
                            nodes.append({
                                'data': {
                                    'id': premiere_type_id,
                                    'label': premiere_type_str,
                                    'type': 'premiere_type'
                                }
                            })
                            node_ids.add(premiere_type_id)
                        edges.append({
                            'data': {
                                'source': piece_id,
                                'target': premiere_type_id,
                                'label': 'tipo de estreno'
                            }
                        })

        print(f"Total nodes: {len(nodes)}, Total edges: {len(edges)}")  # Debug: imprimir total de nodos y edges
        return jsonify({'nodes': nodes, 'edges': edges})
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)

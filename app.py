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
    for param in ['name_q', 'composer_q', 'participant_q', 'piece_q', 'activity_q', 'gender_q', 'year', 'city_id', 'location_id', 'event_type_id', 'cycle_id', 'organization_id', 'instrument_id', 'ensemble_id', 'premiere_type_id', 'composer_id', 'participant_id']:
        value = request.args.get(param)
        if value:
            params[param] = value

    # Llamar a la API externa para obtener eventos
    try:
        response = requests.get(f"{API_BASE_URL}/events", params=params)
        response.raise_for_status()
        data = response.json()
        events = data.get('events', [])
        # print(f"API Response: {data}")  # Debug: imprimir respuesta completa

        # Procesar datos para grafo: nodos y edges
        nodes = []
        edges = []
        node_ids = set()

        for event in events:
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
                if 'name' in participant:
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
                            'label': 'performed_by'
                        }
                    })

            # Relaciones con ciudades
            if 'city' in event and event['city']:
                city_id = f"city_{event['city']['id']}"
                if city_id not in node_ids:
                    nodes.append({
                        'data': {
                            'id': city_id,
                            'label': event['city']['name'],
                            'type': 'city'
                        }
                    })
                    node_ids.add(city_id)
                edges.append({
                    'data': {
                        'source': event_id,
                        'target': city_id,
                        'label': 'in_city'
                    }
                })

            # Relaciones con obras (pieces)
            for piece in event.get('program', []):
                if 'piece_name' in piece and 'composers' in piece:
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
                            'label': 'includes_piece'
                        }
                    })

                    # Relaciones entre piezas y compositores
                    for composer_name in piece['composers']:
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
                                'label': 'composed_by'
                            }
                        })

        return jsonify({'nodes': nodes, 'edges': edges})
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)

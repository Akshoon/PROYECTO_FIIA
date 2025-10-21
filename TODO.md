# TODO: Implementar Grafo Interactivo Similar a Nodegoat

## Información Recopilada
- API externa: http://basedeconciertos.uahurtado.cl:5099/api/status/get_params?full_content=true para contexto, /api/events para consultas.
- Parámetros de búsqueda: name_q, composer_q, participant_q, piece_q, activity_q, gender_q, y filtros por ID como year, city_id, etc.
- Estructura de datos: Eventos con relaciones a compositores, participantes, ciudades, instrumentos, etc.
- Librería de visualización: Cytoscape.js para grafo interactivo.
- Relaciones en grafo: Conectar entidades como eventos a compositores, participantes, ciudades, obras, etc., para mostrar conexiones.

## Plan de Implementación
1. [x] Instalar dependencias necesarias (requests para llamadas API).
2. [x] Crear endpoint en Flask (/api/graph_data) para consultar API externa y procesar datos en formato JSON para grafo (nodos y edges).
3. [x] Actualizar template HTML (index.html) para incluir Cytoscape.js, elementos de búsqueda (inputs para filtros) y contenedor del grafo.
4. [x] Crear lógica en JS (script.js) para:
   - Enviar consultas al endpoint Flask basado en filtros.
   - Construir grafo con Cytoscape.js (nodos para entidades, edges para relaciones).
   - Hacer grafo interactivo (zoom, drag, click para detalles).
5. [x] Actualizar CSS (style.css) para estilizar la interfaz de búsqueda y grafo.
6. [x] Probar integración: Ejecutar app, realizar búsquedas, verificar grafo se actualiza correctamente (app corriendo en http://127.0.0.1:5000, página cargada correctamente).

## Dependencias
- requests (para Python, llamadas API).
- Cytoscape.js (CDN en HTML).

## Followup Steps
- Después de implementación, probar con datos reales del API.
- Si hay errores, depurar llamadas API o lógica de grafo.
- Posiblemente agregar más filtros o personalizaciones basadas en feedback.

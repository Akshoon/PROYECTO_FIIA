# API Documentation for Music Events Database

## Base URL
`http://basedeconciertos.uahurtado.cl/api`

## Endpoint: /events

### Query Parameters

| Parameter | Type | Description | Utility for AI |
| :--- | :--- | :--- | :--- |
| `name_q` | string | Busca texto en el nombre del evento. | Usar cuando el usuario busque conciertos por su título genérico o por palabras clave no indexadas como locaciones. Wildcard amplio sobre 'name'. |
| `composer_q` | string | Busca por texto en el nombre de un compositor. | Fundamental para encontrar participación de un compositor (ej: "Mozart") detectado en OCR sin necesidad de deducir ID. |
| `participant_q` | string | Busca por texto en el nombre de un participante (intérprete, director, etc). | Crucial para encontrar eventos asociados a un individuo sin conocer su ID (ej: "Claudio Arrau"). |
| `piece_q` | string | Busca por nombre de la obra musical. | Filtrar eventos donde se interpretó una pieza específica con nombre parcial. Ej. "Sinfonía No. 9". Ignora diferencias menores de digitación. |
| `activity_q` | string | Busca por el nombre de la actividad o rol (ej. "Piano", "Director"). | Útil para categorizar la programación o encontrar instrumentos solistas expresados de forma textual. |
| `gender_q` | string | Busca por el nombre de un género (ej. "Femenino"). | Filtrar eventos vinculados a participantes de un género específico. |
| `year` | integer list | Filtra por años específicos. | Ideal para delimitar búsquedas temporales. Acepta múltiples años separados por coma (ej. `year=1985,1990`). |
| `city_id` | integer list | Filtra por ID de una o varias ciudades. | Restringe la búsqueda a eventos en zonas geográficas reconocidas. Consultar `/status/get_params?full_content=true`. |
| `location_id` | integer list | Filtra por ID de uno o varios recintos. | Uso condicional si el OCR logra amarrar con alta certidumbre el string textual a un ID conocido. |
| `event_type_id` | integer list | Filtra por ID taxonómico de tipo de evento. | Permite estudios pormenorizados del formato del evento (ej. Concierto Sinfónico). |
| `cycle_id` | integer list | Filtra por ID de un ciclo o temporada. | Útil para aglomerar programas de mano que se declaren como parte de una temporada o ciclo oficial. |
| `organization_id` | integer list | Filtra por ID de organizaciones promotoras. | Crucial para investigar el impacto cultural de patronos específicos de la música. |
| `instrument_id` | integer list | Filtra por ID asociado oficialmente a instrumentos. | Usar si el OCR/LLM ha traducido exitosamente una subcadena textual a una clase de instrumento maestro. |
| `ensemble_id` | integer list | Filtra por ID de agrupaciones (coros, orquestas). | Buscar el protagonismo histórico de cuerpos colectivos en contraste a participantes individuales. |
| `premiere_type_id` | integer list | Filtra por ID de tipo de estreno documentado. | Para aislar eventos que declaren estrenos mundiales o locales con exactitud. |
| `composer_id` | integer list | Filtra por ID numérico unívoco del compositor. | Método preferente para consultar repertorio asociado a un creador tras resolver su ID, evitando errores de tipeo. |
| `participant_id` | integer list | Filtra por ID numérico unívoco del participante. | Método estricto para recuperar ejecuciones de un sujeto identificado sin ambigüedad del OCR. |
| `page` | integer | Número de la página solicitado (default 1). | Control de flujo y batch iterativo para grandes volúmenes de respuestas JSON. |
| `per_page` | integer | Resultados por página (default 25, max 100). | Ajustar en relación al tamaño de la ventana de contexto del LLM. |

### Response Structure

Un query exitoso retorna un objeto JSON con dos llaves principales:

#### `events` (Array)

Cada objeto de evento contiene la información detallada de la presentación:

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | integer | ID único del evento. |
| `name` | string | Nombre descriptivo del evento. |
| `year` | integer | Año de realización. |
| `location` | string | Ubicación formateada como: `Nombre del Recinto - Dirección, Ciudad (País)`. |
| `event_type` | string | Categoría taxonómica del evento (ej. Concierto). |
| `cycle` | string | Nombre del ciclo o temporada (o "Ninguno"). |
| `participants` | array | Lista de participantes (`name`, `activity`, `gender`). |
| `program` | array | Obras interpretadas (`piece_name`, `composers`, `premiere_type`). |

#### `pagination` (Object)

| Field | Type | Description |
| :--- | :--- | :--- |
| `total_events` | integer | Total de eventos que coinciden con el filtro. |
| `total_pages` | integer | Cantidad total de páginas disponibles. |
| `current_page` | integer | Página actual consultada. |
| `per_page` | integer | Resultados por página. |
| `has_next` | boolean | Indica si existe una página posterior. |
| `has_prev` | boolean | Indica si existe una página anterior. |

### Example Request
```http
GET http://basedeconciertos.uahurtado.cl/api/events?year=1985&page=1&per_page=50
```

### Example Response
```json
{
  "events": [
    {
      "id": 1,
      "name": "Concierto de Bach",
      "year": 1985,
      "location": "Teatro Municipal - Agustinas 794, Santiago (Chile)",
      "event_type": "Concierto",
      "cycle": "Ciclo Clásico",
      "participants": [
        {
          "name": "Juan Pérez",
          "activity": "Pianista - Piano",
          "gender": "Masculino"
        }
      ],
      "program": [
        {
          "piece_name": "Concierto para Piano No. 1",
          "composers": ["Bach"],
          "premiere_type": "Estreno Mundial"
        }
      ]
    }
  ],
  "pagination": {
    "total_events": 150,
    "total_pages": 3,
    "current_page": 1,
    "per_page": 50,
    "has_next": true,
    "has_prev": false
  }
}
```

## Master Parameter Lists

To obtain all valid IDs and names for filtering, use the following endpoint:
`GET http://basedeconciertos.uahurtado.cl/api/status/get_params?full_content=true`

This returns a JSON object containing global lists for multiple entities. All entities in these lists follow a common structure:
`{ "id": integer, "is_validated": boolean, "name": string }`

### Available Categories

| Category | Description |
| :--- | :--- |
| `activities` | List of roles/activities (e.g., "Violinista", "Director"). |
| `cities` | List of geographic cities where events occur. |
| `composers` | Master list of unique music composers. |
| `cycles` | Lists of official concert series or seasons. |
| `event_types` | Taxonomic classification of events (e.g., "Concierto", "Bingo"). |
| `instruments` | Musical instruments recognized in the database. |
| `musical_ensembles` | Named musical groups (orchestras, choirs). |
| `organizations` | Promoting or sponsoring entities. |
| `participants` | Master list of all individual participants (interpreters, directors). |
| `premiere_types` | Classification of premieres (e.g., "Estreno Mundial"). |

> [!NOTE]
> **About Pieces:** There is no master list for "pieces" (musical works). To search for specific pieces, use the `piece_q` parameter on the `/events` endpoint, which performs a text-based search over the program data.

> [!IMPORTANT]
> **Participants vs. Activities:** While `participants` provides a list of individual names, `activities` describes the roles they play. In the `/events` response, these are combined to show who did what in a specific event.

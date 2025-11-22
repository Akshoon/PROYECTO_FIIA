# API Documentation for Music Events Database

## Base URL
`http://basedeconciertos.uahurtado.cl:5099/api`

## Endpoint: /events

### Query Parameters

#### Text Filters (case-insensitive partial match)
- `name_q`: Filter by event name
- `composer_q`: Filter by composer name
- `participant_q`: Filter by participant name
- `piece_q`: Filter by piece name
- `activity_q`: Filter by activity
- `gender_q`: Filter by gender

#### ID Filters (precise, accepts comma-separated lists)
- `city_id`: Filter by city ID (e.g., city_id=1,5)
- `location_id`: Filter by location ID
- `event_type_id`: Filter by event type ID
- `cycle_id`: Filter by cycle ID
- `organization_id`: Filter by organization ID
- `instrument_id`: Filter by instrument ID
- `ensemble_id`: Filter by musical ensemble ID
- `premiere_type_id`: Filter by premiere type ID
- `composer_id`: Filter by composer ID
- `participant_id`: Filter by participant ID

#### Other Filters
- `year`: Filter by year (accepts integer list, e.g., year=1985,1986)

#### Pagination
- `page`: Page number (default: 1)
- `per_page`: Results per page (default: 25, max: 100)

### Response Structure

A successful query returns a JSON object with two main keys:

#### `events`
An array of event objects, each containing:
- `id`: Event ID
- `name`: Event name
- `year`: Event year
- `location`: Event location
- `event_type`: Type of event
- `cycle`: Event cycle
- `participants`: Array of participant objects with `name` and `activity`
- `program`: Array of program pieces with `piece_name`, `composers`, `premiere_type`

#### `pagination`
An object with pagination metadata:
- `total_events`: Total number of events matching the query
- `total_pages`: Total number of pages
- `current_page`: Current page number
- `per_page`: Results per page
- `has_next`: Boolean indicating if there's a next page
- `has_prev`: Boolean indicating if there's a previous page

### Example Request
```
GET http://basedeconciertos.uahurtado.cl:5099/api/events?year=1985&page=1&per_page=50
```

### Example Response
```json
{
  "events": [
    {
      "id": 1,
      "name": "Concierto de Bach",
      "year": 1985,
      "location": "Teatro Municipal, Santiago (Chile)",
      "event_type": "Concierto",
      "cycle": "Ciclo Clásico",
      "participants": [
        {
          "name": "Juan Pérez",
          "activity": "Pianista - Piano"
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

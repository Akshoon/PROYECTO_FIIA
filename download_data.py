#!/usr/bin/env python3
"""
Script to download all concert data from the API for monthly ingestion.
This script fetches all events and parameters, then stores them in a JSON file
that can be used for bulk import into the application.
"""

import requests
import json
import time
from datetime import datetime
import sys
import os

API_BASE_URL = "http://basedeconciertos.uahurtado.cl:5099"

def get_params():
    """Get all parameters (composers, cities, instruments)"""
    print("Fetching parameters...")
    try:
        response = requests.get(f"{API_BASE_URL}/api/status/get_params?full_content=true")
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching parameters: {e}")
        return None

def get_all_events():
    """Get all events using pagination"""
    print("Fetching all events...")
    events = []
    page = 1

    while True:
        try:
            print(f"Fetching page {page}...")
            response = requests.get(f"{API_BASE_URL}/api/events?page={page}&per_page=100")
            response.raise_for_status()
            data = response.json()

            if not data.get('events'):
                break

            events.extend(data['events'])
            print(f"Page {page}: {len(data['events'])} events (total: {len(events)})")

            # Check if there are more pages
            if not data.get('pagination', {}).get('has_next', False):
                break

            page += 1
            time.sleep(0.1)  # Small delay to be respectful to the API

        except requests.exceptions.RequestException as e:
            print(f"Error fetching page {page}: {e}")
            break

    # Robustez: asegurarse de que los campos importantes sean listas
    fixed_count = 0
    for event in events:
        if event.get('participants') is None:
            event['participants'] = []
            fixed_count += 1
        if event.get('program') is None:
            event['program'] = []
            fixed_count += 1
    if fixed_count:
        print(f"Fixed {fixed_count} events with null participants/program fields.")

    return events

def load_api_documentation():
    """Load API documentation from local JSON file"""
    print("Loading API documentation...")
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        api_doc_path = os.path.join(script_dir, 'api_documentation.json')

        with open(api_doc_path, 'r', encoding='utf-8') as f:
            api_doc = json.load(f)

        print("API documentation loaded successfully")
        return api_doc
    except FileNotFoundError:
        print("Warning: api_documentation.json not found. Continuing without API documentation.")
        return None
    except json.JSONDecodeError as e:
        print(f"Error parsing API documentation JSON: {e}")
        return None

def main():
    print("Starting monthly data ingestion...")
    print(f"API Base URL: {API_BASE_URL}")

    # Get parameters
    params = get_params()
    if not params:
        print("Failed to get parameters. Exiting.")
        sys.exit(1)

    # Get all events
    events = get_all_events()
    if not events:
        print("Failed to get events. Exiting.")
        sys.exit(1)

    # Load API documentation
    api_documentation = load_api_documentation()

    # Create the data structure
    data = {
        "params": params,
        "events": events,
        "timestamp": int(time.time() * 1000),  # milliseconds since epoch
        "metadata": {
            "total_events": len(events),
            "ingestion_date": datetime.now().isoformat(),
            "api_version": "1.0"
        }
    }

    # Include API documentation if available
    if api_documentation:
        data["api_documentation"] = api_documentation
        print("API documentation included in data structure")

    # Save to file
    filename = f"concert_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    print(f"Saving data to {filename}...")

    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("Data ingestion completed successfully!")
    print(f"Total events: {len(events)}")
    print(f"File saved: {filename}")
    print(f"File size: {len(json.dumps(data))} bytes")

    if api_documentation:
        print("✓ API documentation included")
    else:
        print("⚠ API documentation not included")

if __name__ == "__main__":
    main()

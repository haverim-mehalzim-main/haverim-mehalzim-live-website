import os
import json
from datetime import datetime

import requests
from app.config import BOARD_ID, MONDAY_URL, MONDAY_HEADERS
from app.features.incidents.constants import GROUP_OPENED, INCIDENT_TYPE_TRANSLATIONS

# Only the columns the app actually uses — avoids fetching stale / irrelevant data.
_NEEDED_COLUMNS = [
    "status_mkmbjwef",   # map live/handled status
    "color_mkvvrm1r",    # dashboard handled filter (Hebrew statuses)
    "status_mkmb1zc6",   # incident type
    "location_mkmbv7be", # primary map coordinate
    "country_mkmb91h3",  # fallback map coordinate / country breakdown
    "check_mkn3c7v8",    # life-threatening flag
    "timeline_mkmbcabh", # date range for current-month filter
    "text_mm42945p",     # incident description (what happened)
    "text_mm2rbp1q",     # incident assistance (how we helped)
]

_COL_IDS = ', '.join(f'"{c}"' for c in _NEEDED_COLUMNS)

_QUERY = """
{
  boards (ids: [%s]) {
    items_page (limit: 500) {
      items {
        id
        name
        column_values (ids: [%s]) {
          id
          text
          value
        }
      }
    }
  }
}
""" % (BOARD_ID, _COL_IDS)


def fetch_monday_data():
    try:
        response = requests.post(MONDAY_URL, json={'query': _QUERY}, headers=MONDAY_HEADERS)

        if response.status_code != 200:
            print(f"HTTP Error {response.status_code}: {response.text}")
            return None

        data = response.json()

        if 'errors' in data:
            print("GraphQL Error:", data['errors'])
            return None

        items = data['data']['boards'][0]['items_page']['items']

        processed_rows = []
        missing_count = 0

        for item in items:
            row = {'name': item['name'], 'id': item['id']}
            for cv in item['column_values']:
                row[cv['id']] = cv['text']
                # Monday's Country column carries a language-independent ISO-2 code
                # in its `value` JSON. Surface it so the map can resolve any country
                # (incl. ones never seen before) without a hand-maintained name list.
                if cv['id'] == 'country_mkmb91h3' and cv.get('value'):
                    try:
                        row['country_code'] = (json.loads(cv['value']) or {}).get('countryCode')
                    except (ValueError, TypeError):
                        pass

            location = row.get('location_mkmbv7be', '').strip()
            country  = row.get('country_mkmb91h3',  '').strip()

            if not location and not country:
                missing_count += 1
            else:
                processed_rows.append(row)

        print(
            f"[fetch_monday_data] total={len(items)} "
            f"with_location={len(processed_rows)} "
            f"missing_location={missing_count}"
        )

        return processed_rows

    except Exception as e:
        print(f"Error fetching Monday data: {str(e)}")
        return None


# ── Column ids for WRITING a newly self-service-opened incident ─────────────
# Same board, subset of _NEEDED_COLUMNS actually set on creation — staff still
# gather everything else (victim details, insurance, citizenship, files)
# through the existing full intake process; this just gets the case open and
# visible (map, "my incidents", public tracker) in the right initial state.
_STATUS_MAP_COL     = "status_mkmbjwef"   # map live/handled status
_STATUS_HANDLED_COL = "color_mkvvrm1r"    # Hebrew "handled" status
_TYPE_COL           = "status_mkmb1zc6"   # incident type (Hebrew label)
_LOCATION_COL       = "location_mkmbv7be"
_LIFE_THREAT_COL    = "check_mkn3c7v8"
_TIMELINE_COL       = "timeline_mkmbcabh"
_TRACKER_STAGE_COL  = "color_mm32c8wh"    # public case-tracker stage
_DESCRIPTION_COL    = "text_mm42945p"

# The form shows English incident-type labels; Monday's column stores the
# Hebrew value the board's labels are actually configured with.
_ENGLISH_TO_HEBREW_TYPE = {v: k for k, v in INCIDENT_TYPE_TRANSLATIONS.items()}


def _escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def create_incident(*, incident_type: str, location: str, description: str, life_threatening: bool, requester_name: str) -> str | None:
    """
    Create a new incident item from a logged-in user's "Open a Call"
    submission. Returns the new Monday item id, or None on failure.
    """
    if not BOARD_ID:
        print("[service] BOARD_ID not set — cannot create incident")
        return None

    today = datetime.now().strftime("%Y-%m-%d")
    hebrew_type = _ENGLISH_TO_HEBREW_TYPE.get(incident_type, incident_type)

    values: dict = {
        _STATUS_MAP_COL:     {"label": "Live"},
        _STATUS_HANDLED_COL: {"label": GROUP_OPENED},
        _TYPE_COL:           {"label": hebrew_type},
        _LOCATION_COL:       location,
        _TIMELINE_COL:       {"from": today, "to": today},
        _TRACKER_STAGE_COL:  {"label": "Request Received"},
        _DESCRIPTION_COL:    description,
    }
    if life_threatening:
        values[_LIFE_THREAT_COL] = {"checked": "true"}

    col_values = _escape(json.dumps(values))
    item_name = _escape(f"{requester_name} — {incident_type}" if requester_name else incident_type)

    query = f"""
      mutation {{
        create_item(
          board_id: {BOARD_ID},
          item_name: "{item_name}",
          column_values: "{col_values}",
          create_labels_if_missing: true
        ) {{ id }}
      }}
    """
    try:
        resp = requests.post(MONDAY_URL, json={"query": query}, headers=MONDAY_HEADERS, timeout=15)
        data = resp.json()
        if "errors" in data:
            print(f"[service] Monday error creating incident: {data['errors']}")
            return None
        return data["data"]["create_item"]["id"]
    except Exception as e:
        print(f"[service] Failed to create incident: {e}")
        return None


def fetch_incidents_by_ids(monday_item_ids: list) -> list:
    """
    Fetch just the given incidents by Monday item id — used for "my
    incidents" so a dashboard load doesn't pull the entire board. Same
    column/row shape as fetch_monday_data(). Returns [] (never None) on any
    failure or empty input, so callers can iterate unconditionally.
    """
    ids = [str(i) for i in monday_item_ids if str(i).isdigit()]
    if not ids:
        return []

    ids_gql = ", ".join(ids)
    query = f"""
    {{
      items (ids: [{ids_gql}]) {{
        id
        name
        column_values (ids: [{_COL_IDS}]) {{
          id
          text
          value
        }}
      }}
    }}
    """
    try:
        resp = requests.post(MONDAY_URL, json={"query": query}, headers=MONDAY_HEADERS, timeout=15)
        data = resp.json()
        if "errors" in data:
            print(f"[service] Monday error fetching incidents by id: {data['errors']}")
            return []

        rows = []
        for item in data["data"]["items"]:
            row = {"name": item["name"], "id": item["id"]}
            for cv in item["column_values"]:
                row[cv["id"]] = cv["text"]
                if cv["id"] == "country_mkmb91h3" and cv.get("value"):
                    try:
                        row["country_code"] = (json.loads(cv["value"]) or {}).get("countryCode")
                    except (ValueError, TypeError):
                        pass
            rows.append(row)
        return rows
    except Exception as e:
        print(f"[service] Failed to fetch incidents by id: {e}")
        return []

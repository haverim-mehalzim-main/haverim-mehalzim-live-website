import os
import json
from datetime import datetime

import requests
from app.config import BOARD_ID, MONDAY_URL, MONDAY_HEADERS
from app.features.incidents.constants import (
    INCIDENT_TYPE_TRANSLATIONS,
    NEW_REQUEST_STATUS,
    GENDER_TRANSLATIONS,
    COUNTRY_NAME_BY_CODE,
    HEBREW_MONTHS,
)

# Only the columns the app actually uses — avoids fetching stale / irrelevant data.
_NEEDED_COLUMNS = [
    "status_mkmbjwef",   # map live/handled status
    "color_mkvvrm1r",    # dashboard handled filter (Hebrew statuses)
    "status_mkmb1zc6",   # incident type
    "location_mkmbv7be", # primary map coordinate
    "country_mkmb91h3",  # fallback map coordinate / country breakdown
    "check_mkn3c7v8",    # life-threatening flag (set by staff, never by self-service)
    "timeline_mkmbcabh", # date range for current-month filter
    "text_mm42945p",     # incident description (what happened) — staff-entered incidents
    "text_mm2rbp1q",     # incident assistance (how we helped)
    "numeric_mkng2emx",  # patient/victim age
    "color_mkngmw3",     # patient/victim gender
    "phone_mkz3dr0y",    # patient/victim phone (structured column, rarely set via self-service — see create_incident)
    "text_mkz3yv22",     # filer's name + phone (free text)
    "long_text_mkpfvmh3", # incident description (what happened) — self-service-opened incidents (see create_incident)
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
# visible (staff board, "my incidents", public tracker) in the right initial
# state.
#
# Deliberately NOT set here:
#   color_mkvvrm1r (Hebrew "handled" status) — an unreviewed, just-submitted
#   incident must not count toward "handled" stats. Left at Monday's own
#   default; staff set this themselves once they've actually reviewed it.
#
#   location_mkmbv7be — Monday's "location" column requires real lat/lng
#   coordinates (a plain address is rejected outright); our minimal form only
#   collects a free-text city, no geocoding. The submitted city is folded
#   into the description below instead, and kept verbatim in our own DB
#   (Incident.submitted_location) for "my incidents" to display.
#
#   phone_mkz3dr0y (patient's phone, a structured "phone" column) — Monday
#   validates this against a phone number + ISO-2 country code; our minimal
#   form collects neither format nor country, so a raw digit string would be
#   rejected the same way the location column was. The submitted number is
#   folded into the description below instead, and kept verbatim in our own
#   DB (Incident.submitted_patient_phone) for display.
#
#   check_mkn3c7v8 (life-threatening) — determined by staff after reviewing
#   the case, not by whoever fills in the form. Left at Monday's own default.
#
#   timeline_mkmbcabh — staff set this once the case is actually being worked,
#   not at the moment of a raw, unreviewed self-service submission.
#
# status_mkmbjwef (map status) IS explicitly set — to NEW_REQUEST_STATUS, not
# left at Monday's own column default. The board's default label ("Working
# on it") is itself one of the live-map statuses, so leaving it unset would
# have put an unreviewed incident straight onto the public map anyway.
#
# name (item title) is set to the patient/victim's name, matching the
# convention already used by every existing item on this board — NOT the
# filer's name (see _FILER_COL below for that).
_STATUS_MAP_COL     = "status_mkmbjwef"
_TYPE_COL           = "status_mkmb1zc6"   # incident type (Hebrew label)
_TRACKER_STAGE_COL  = "color_mm32c8wh"    # public case-tracker stage
_DESCRIPTION_COL    = "long_text_mkpfvmh3"  # long_text: {"text": "..."} — NOT the plain-string "text" format
_PATIENT_AGE_COL    = "numeric_mkng2emx"
_PATIENT_GENDER_COL = "color_mkngmw3"
_FILER_COL          = "text_mkz3yv22"     # free text: filer's name + phone
_COUNTRY_COL        = "country_mkmb91h3"  # structured: {"countryCode", "countryName"}
_MONTH_COL          = "color_mkmby5dg"    # status label "<Hebrew month> <year>"

# The form shows English incident-type labels; Monday's column stores the
# Hebrew value the board's labels are actually configured with.
_ENGLISH_TO_HEBREW_TYPE = {v: k for k, v in INCIDENT_TYPE_TRANSLATIONS.items()}
_ENGLISH_TO_HEBREW_GENDER = {v: k for k, v in GENDER_TRANSLATIONS.items()}


def _escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def create_incident(
    *,
    incident_type: str,
    city: str,
    country_code: str,
    description: str,
    patient_name: str,
    filer_name: str,
    filer_phone: str = "",
    patient_age: int | None = None,
    patient_gender: str = "",
    patient_phone: str = "",
) -> str | None:
    """
    Create a new incident item from a logged-in user's "Open a Call"
    submission. Returns the new Monday item id, or None on failure.
    """
    if not BOARD_ID:
        print("[service] BOARD_ID not set — cannot create incident")
        return None

    now = datetime.now()
    hebrew_type = _ENGLISH_TO_HEBREW_TYPE.get(incident_type, incident_type)
    month_label = f"{HEBREW_MONTHS[now.month]} {now.year}"
    country_name = COUNTRY_NAME_BY_CODE.get(country_code, country_code)

    description_parts = [f"City (as reported): {city}"]
    if patient_phone:
        description_parts.append(f"Patient/missing person phone (as reported): {patient_phone}")
    description_parts.append(description)
    full_description = "\n\n".join(description_parts)

    filer_info = filer_name
    if filer_phone:
        filer_info = f"{filer_name} — {filer_phone}"

    values: dict = {
        _STATUS_MAP_COL:     {"label": NEW_REQUEST_STATUS},
        _TYPE_COL:           {"label": hebrew_type},
        _TRACKER_STAGE_COL:  {"label": "Request Received"},
        _DESCRIPTION_COL:    {"text": full_description},
        _FILER_COL:          filer_info,
        _COUNTRY_COL:        {"countryCode": country_code, "countryName": country_name},
        _MONTH_COL:          {"label": month_label},
    }
    if patient_age is not None:
        values[_PATIENT_AGE_COL] = str(patient_age)
    if patient_gender:
        hebrew_gender = _ENGLISH_TO_HEBREW_GENDER.get(patient_gender, patient_gender)
        values[_PATIENT_GENDER_COL] = {"label": hebrew_gender}

    col_values = _escape(json.dumps(values))
    item_name = _escape(patient_name)

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

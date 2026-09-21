import os
import json
import re
from datetime import datetime

import requests
from app.config import BOARD_ID, MONDAY_URL, MONDAY_HEADERS
from app.features.incidents.constants import (
    INCIDENT_TYPE_TRANSLATIONS,
    NEW_REQUEST_STATUS,
    GENDER_TRANSLATIONS,
    COUNTRY_NAME_BY_CODE,
    HEBREW_MONTHS,
    STATUS_TRANSLATIONS,
    INCIDENT_STATUS_TRANSLATIONS,
    CASE_STAGE_TRANSLATIONS,
    COMBAT_SERVICE_TRANSLATIONS,
    INSURANCE_TRANSLATIONS,
    CALL_SOURCE_TRANSLATIONS,
    CCC_OFFICIAL_TRANSLATIONS,
    INCIDENT_MANAGER_TRANSLATIONS,
    SUPERVISOR_TRANSLATIONS,
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
    "color_mm32c8wh",    # public/family case-tracker stage
    "text_mkmbt7j5",     # date/time the request came in (plain text column)
    "text_mm435fh9",     # date/time the case was closed (plain text column)
    "color_mkmbwnzy",    # patient/victim's insurance company
    "single_selectynfloxz", # patient/victim's combat military service status
    "color_mkmbpyxw",    # how this case first reached the org
    "color_mkmbwakp",    # duty officer ("CCC Official") on shift when it came in
    "status_mkmb9hbk",   # staff member managing the case
    "status_mkmb6bm2",   # supervisor overseeing the case
    "long_text_mknd9c64", # case-closure: summary of how we assisted
    "long_text_mm31t5ky", # case-closure: key lessons learned
    "text_mkmbref6",     # case-closure: point of locating/rescue, if relevant
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
#   collects a free-text city, no geocoding. Left alone — do not write to
#   this column. The submitted city is kept verbatim in our own DB
#   (Incident.submitted_location) for "my incidents" to display.
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
#
# phone_mkz3dr0y (patient's phone, a structured "phone" column) IS set, using
# the incident's own country as the phone's country code — but as a SEPARATE
# best-effort mutation after create_item succeeds (see create_incident), not
# in the same call as everything else. Monday validates this column against
# a real number-format-per-country rule, so a value we can't fully control
# (whatever digits the requester typed) could get rejected — that must never
# take the rest of the incident down with it.
_STATUS_MAP_COL     = "status_mkmbjwef"
_TYPE_COL           = "status_mkmb1zc6"   # incident type (Hebrew label)
_TRACKER_STAGE_COL  = "color_mm32c8wh"    # public case-tracker stage
_DESCRIPTION_COL    = "long_text_mkpfvmh3"  # long_text: {"text": "..."} — NOT the plain-string "text" format
_PATIENT_AGE_COL    = "numeric_mkng2emx"
_PATIENT_GENDER_COL = "color_mkngmw3"
_PATIENT_PHONE_COL  = "phone_mkz3dr0y"    # structured: {"phone": "<digits>", "countryShortName": "<ISO-2>"}
_FILER_COL          = "text_mkz3yv22"     # free text: filer's name + phone
_COUNTRY_COL        = "country_mkmb91h3"  # structured: {"countryCode", "countryName"}
_MONTH_COL          = "color_mkmby5dg"    # status label "<Hebrew month> <year>"
_CASE_STATUS_COL    = "color_mkvvrm1r"    # internal case status (dashboard "handled" filter)
_LOCATION_COL       = "location_mkmbv7be" # structured: {"lat", "lng", "address"} — needs real coordinates, see update_incident
_LIFE_THREATENING_COL = "check_mkn3c7v8"  # checkbox: {"checked": "true"/"false"}
_IN_REQUEST_AT_COL  = "text_mkmbt7j5"     # plain text — "when the request came in", auto-filled on self-service creation
_CLOSED_AT_COL      = "text_mm435fh9"     # plain text — "when the case was closed", staff-entered
_COMBAT_SERVICE_COL = "single_selectynfloxz"
_INSURANCE_COL      = "color_mkmbwnzy"
_CALL_SOURCE_COL    = "color_mkmbpyxw"
_CCC_OFFICIAL_COL   = "color_mkmbwakp"
_INCIDENT_MANAGER_COL = "status_mkmb9hbk"
_SUPERVISOR_COL     = "status_mkmb6bm2"
_CLOSURE_SUMMARY_COL = "long_text_mknd9c64"  # long_text: {"text": "..."}
_CLOSURE_LESSONS_COL = "long_text_mm31t5ky"  # long_text: {"text": "..."}
_CLOSURE_LOCATING_COL = "text_mkmbref6"      # plain text

# The form shows English labels; Monday's columns store the Hebrew value the
# board's own labels are actually configured with (or, for a few columns
# that are already English on the board itself, the identity mapping falls
# straight through).
_ENGLISH_TO_HEBREW_TYPE = {v: k for k, v in INCIDENT_TYPE_TRANSLATIONS.items()}
_ENGLISH_TO_HEBREW_GENDER = {v: k for k, v in GENDER_TRANSLATIONS.items()}
_ENGLISH_TO_HEBREW_STATUS = {v: k for k, v in STATUS_TRANSLATIONS.items()}
_ENGLISH_TO_REAL_INCIDENT_STATUS = {v: k for k, v in INCIDENT_STATUS_TRANSLATIONS.items()}
_ENGLISH_TO_REAL_CASE_STAGE = {v: k for k, v in CASE_STAGE_TRANSLATIONS.items()}
_ENGLISH_TO_HEBREW_COMBAT_SERVICE = {v: k for k, v in COMBAT_SERVICE_TRANSLATIONS.items()}
_ENGLISH_TO_HEBREW_INSURANCE = {v: k for k, v in INSURANCE_TRANSLATIONS.items()}
_ENGLISH_TO_HEBREW_CALL_SOURCE = {v: k for k, v in CALL_SOURCE_TRANSLATIONS.items()}
_ENGLISH_TO_HEBREW_CCC_OFFICIAL = {v: k for k, v in CCC_OFFICIAL_TRANSLATIONS.items()}
_ENGLISH_TO_HEBREW_INCIDENT_MANAGER = {v: k for k, v in INCIDENT_MANAGER_TRANSLATIONS.items()}
_ENGLISH_TO_HEBREW_SUPERVISOR = {v: k for k, v in SUPERVISOR_TRANSLATIONS.items()}

# Every "pick one label" field an admin can edit: kwarg name -> (column id,
# English → real-board-label reverse map). Handled uniformly by
# update_incident below regardless of whether the board's own labels happen
# to be Hebrew or already English.
_LABEL_FIELDS = {
    "incident_type":    (_TYPE_COL, _ENGLISH_TO_HEBREW_TYPE),
    "status_label":     (_CASE_STATUS_COL, _ENGLISH_TO_HEBREW_STATUS),
    "incident_status":  (_STATUS_MAP_COL, _ENGLISH_TO_REAL_INCIDENT_STATUS),
    "case_stage":       (_TRACKER_STAGE_COL, _ENGLISH_TO_REAL_CASE_STAGE),
    "patient_gender":   (_PATIENT_GENDER_COL, _ENGLISH_TO_HEBREW_GENDER),
    "combat_service":   (_COMBAT_SERVICE_COL, _ENGLISH_TO_HEBREW_COMBAT_SERVICE),
    "insurance":        (_INSURANCE_COL, _ENGLISH_TO_HEBREW_INSURANCE),
    "call_source":      (_CALL_SOURCE_COL, _ENGLISH_TO_HEBREW_CALL_SOURCE),
    "ccc_official":     (_CCC_OFFICIAL_COL, _ENGLISH_TO_HEBREW_CCC_OFFICIAL),
    "incident_manager": (_INCIDENT_MANAGER_COL, _ENGLISH_TO_HEBREW_INCIDENT_MANAGER),
    "supervisor":       (_SUPERVISOR_COL, _ENGLISH_TO_HEBREW_SUPERVISOR),
}

# Plain-text fields (no label matching, no format wrapping — just a string).
_PLAIN_TEXT_FIELDS = {
    "caller_info":             _FILER_COL,
    "in_request_at":           _IN_REQUEST_AT_COL,
    "closed_at":               _CLOSED_AT_COL,
    "closure_locating_point":  _CLOSURE_LOCATING_COL,
}

# long_text columns need {"text": "..."}, not a bare string.
_LONG_TEXT_FIELDS = {
    "description":       _DESCRIPTION_COL,
    "closure_summary":   _CLOSURE_SUMMARY_COL,
    "closure_lessons":   _CLOSURE_LESSONS_COL,
}


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

    filer_info = filer_name
    if filer_phone:
        filer_info = f"{filer_name} — {filer_phone}"

    values: dict = {
        _STATUS_MAP_COL:     {"label": NEW_REQUEST_STATUS},
        _TYPE_COL:           {"label": hebrew_type},
        _TRACKER_STAGE_COL:  {"label": "Request Received"},
        _DESCRIPTION_COL:    {"text": description},
        _FILER_COL:          filer_info,
        _COUNTRY_COL:        {"countryCode": country_code, "countryName": country_name},
        _MONTH_COL:          {"label": month_label},
        # Staff-entered incidents fill this in by hand; a self-service one
        # opened through the app has a real, known submission time, so it's
        # captured automatically instead of leaving it for someone to type.
        _IN_REQUEST_AT_COL:  now.strftime("%Y-%m-%d %H:%M"),
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
        item_id = data["data"]["create_item"]["id"]
    except Exception as e:
        print(f"[service] Failed to create incident: {e}")
        return None

    if patient_phone:
        _set_patient_phone_best_effort(item_id, patient_phone, country_code)

    return item_id


def _set_patient_phone_best_effort(item_id: str, patient_phone: str, country_code: str) -> None:
    """
    Best-effort follow-up write of the patient's phone, kept separate from
    create_item — Monday validates phone_mkz3dr0y against a real
    number-format-per-country rule, so a value we don't fully control could
    be rejected; that must never take the rest of the incident down with it
    (the item already exists by the time this runs).
    """
    digits = re.sub(r"\D", "", patient_phone)
    if not digits:
        return

    phone_values = _escape(json.dumps({_PATIENT_PHONE_COL: {"phone": digits, "countryShortName": country_code}}))
    query = f"""
      mutation {{
        change_multiple_column_values(
          item_id: {item_id},
          board_id: {BOARD_ID},
          column_values: "{phone_values}"
        ) {{ id }}
      }}
    """
    try:
        resp = requests.post(MONDAY_URL, json={"query": query}, headers=MONDAY_HEADERS, timeout=15)
        data = resp.json()
        if "errors" in data:
            print(f"[service] Monday error setting patient phone on {item_id}: {data['errors']}")
    except Exception as e:
        print(f"[service] Failed to set patient phone on {item_id}: {e}")


def _mutate_columns(item_id: str, values: dict) -> bool:
    """Shared change_multiple_column_values call — used by update_incident's
    main write and both of its best-effort sub-writes (phone, location)."""
    col_values = _escape(json.dumps(values))
    query = f"""
      mutation {{
        change_multiple_column_values(
          item_id: {item_id},
          board_id: {BOARD_ID},
          column_values: "{col_values}"
        ) {{ id }}
      }}
    """
    try:
        resp = requests.post(MONDAY_URL, json={"query": query}, headers=MONDAY_HEADERS, timeout=15)
        data = resp.json()
        if "errors" in data:
            print(f"[service] Monday error updating item {item_id}: {data['errors']}")
            return False
        return True
    except Exception as e:
        print(f"[service] Failed to update item {item_id}: {e}")
        return False


def _geocode_address(address: str) -> tuple[str, str] | None:
    """Best-effort forward geocoding via OpenStreetMap Nominatim (free, no
    API key) — Monday's location column needs real coordinates, an address
    string alone is rejected (see update_incident). Returns (lat, lng) as
    strings, or None if the address couldn't be resolved. Never raises — a
    failed geocode must not block the rest of an incident edit."""
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": address, "format": "json", "limit": 1},
            headers={"User-Agent": "HaverimMehalzimIncidentsApp/1.0"},
            timeout=8,
        )
        results = resp.json()
        if not results:
            return None
        return results[0]["lat"], results[0]["lon"]
    except Exception as e:
        print(f"[service] Geocoding failed for {address!r}: {e}")
        return None


def update_incident(*, item_id: str, fields: dict) -> tuple[bool, list[str]]:
    """
    Staff-driven edit of an existing incident's Monday.com item. `fields` is
    a sparse {field_name: value} dict — only keys actually present are
    touched, every other column is left exactly as it is. Same
    columns/value formats create_incident already writes at creation time,
    just targeting an item that already exists. Monday.com stays the source
    of truth; this is the write path that lets staff manage a case through
    the app instead of switching over to Monday's own UI.

    Recognized keys:
      - "pick one label" fields (value must be one of that field's known
        English options — see _LABEL_FIELDS): incident_type, status_label,
        incident_status, case_stage, patient_gender, combat_service,
        insurance, call_source, ccc_official, incident_manager, supervisor.
      - plain text: caller_info, in_request_at, closed_at,
        closure_locating_point.
      - long text: description, closure_summary, closure_lessons.
      - patient_age (number), life_threatening (bool).
      - country_code (ISO-2) — writes the structured country column.
      - patient_phone — needs country_code in the same call to know the
        dialing country; written as a separate best-effort mutation, same
        reasoning as _set_patient_phone_best_effort at creation time.
      - city — the free-text city/area, geocoded and written to the
        structured location column as a separate best-effort mutation.

    Returns (ok, warnings): ok is False only if the core mutation itself
    failed (an unrecognized label value, or the Monday API call erroring);
    warnings lists any best-effort sub-writes that didn't take even though
    everything else succeeded.
    """
    if not BOARD_ID:
        print("[service] BOARD_ID not set — cannot update incident")
        return False, []

    values: dict = {}

    for field, (col_id, reverse_map) in _LABEL_FIELDS.items():
        if field not in fields:
            continue
        real_label = reverse_map.get(fields[field])
        if real_label is None:
            return False, []
        values[col_id] = {"label": real_label}

    for field, col_id in _PLAIN_TEXT_FIELDS.items():
        if field in fields:
            values[col_id] = fields[field]

    for field, col_id in _LONG_TEXT_FIELDS.items():
        if field in fields:
            values[col_id] = {"text": fields[field]}

    if "patient_age" in fields:
        values[_PATIENT_AGE_COL] = str(fields["patient_age"])

    if "life_threatening" in fields:
        values[_LIFE_THREATENING_COL] = {"checked": "true" if fields["life_threatening"] else "false"}

    if "country_code" in fields:
        country_code = fields["country_code"]
        country_name = COUNTRY_NAME_BY_CODE.get(country_code)
        if country_name is None:
            return False, []
        values[_COUNTRY_COL] = {"countryCode": country_code, "countryName": country_name}

    if values and not _mutate_columns(item_id, values):
        return False, []

    warnings: list[str] = []

    if fields.get("patient_phone"):
        country_code = fields.get("country_code")
        if not country_code:
            warnings.append("Patient phone needs a country selected too — not saved.")
        else:
            digits = re.sub(r"\D", "", fields["patient_phone"])
            if digits and not _mutate_columns(item_id, {_PATIENT_PHONE_COL: {"phone": digits, "countryShortName": country_code}}):
                warnings.append("Patient phone couldn't be saved — check the number format.")

    if fields.get("city"):
        coords = _geocode_address(fields["city"])
        if coords is None:
            warnings.append("Couldn't place the map pin for that city/area — everything else was saved.")
        else:
            lat, lng = coords
            if not _mutate_columns(item_id, {_LOCATION_COL: {"lat": lat, "lng": lng, "address": fields["city"]}}):
                warnings.append("Couldn't save the map pin for that city/area.")

    return True, warnings


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

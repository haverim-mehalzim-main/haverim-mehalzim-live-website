from datetime import datetime
from app.features.incidents.constants import (
    SIGNIFICANT_INCIDENT,
    INCIDENT_TYPE_TRANSLATIONS,
    INCIDENT_STATUS_TRANSLATIONS,
)


def count_incidents_per_type(incidents_list):
    event_counts = {}
    for row in incidents_list:
        raw = (row.get('status_mkmb1zc6') or '').strip()
        event_type = INCIDENT_TYPE_TRANSLATIONS.get(raw, raw) or 'Unknown'
        event_counts[event_type] = event_counts.get(event_type, 0) + 1
    return event_counts


def get_incidents_current_year(incidents_list):
    now = datetime.now()
    result = []
    for row in incidents_list:
        timeline = row.get('timeline_mkmbcabh')
        if timeline and '-' in timeline:
            try:
                start = datetime.strptime(timeline.split(' - ')[0].strip(), '%Y-%m-%d')
                if start.year == now.year:
                    result.append(row)
            except Exception as e:
                print(f"Skipping row due to date error: {e}")
    return result


def get_incidents_current_month(incidents_list):
    now = datetime.now()
    result = []
    for row in incidents_list:
        timeline = row.get('timeline_mkmbcabh')
        if timeline and '-' in timeline:
            try:
                start = datetime.strptime(timeline.split(' - ')[0].strip(), '%Y-%m-%d')
                if start.year == now.year and start.month == now.month:
                    result.append(row)
            except Exception as e:
                print(f"Skipping row due to date error: {e}")
    return result


def get_incidents_year_before_last(incidents_list):
    now = datetime.now()
    target_year = now.year - 2
    result = []
    for row in incidents_list:
        timeline = row.get('timeline_mkmbcabh')
        if timeline and '-' in timeline:
            try:
                start = datetime.strptime(timeline.split(' - ')[0].strip(), '%Y-%m-%d')
                if start.year == target_year:
                    result.append(row)
            except Exception as e:
                print(f"Skipping row due to date error: {e}")
    return result


def get_incidents_last_year(incidents_list):
    now = datetime.now()
    target_year = now.year - 1
    result = []
    for row in incidents_list:
        timeline = row.get('timeline_mkmbcabh')
        if timeline and '-' in timeline:
            try:
                start = datetime.strptime(timeline.split(' - ')[0].strip(), '%Y-%m-%d')
                if start.year == target_year:
                    result.append(row)
            except Exception as e:
                print(f"Skipping row due to date error: {e}")
    return result


def get_incidents_last_month(incidents_list):
    now = datetime.now()
    if now.month == 1:
        target_year, target_month = now.year - 1, 12
    else:
        target_year, target_month = now.year, now.month - 1
    result = []
    for row in incidents_list:
        timeline = row.get('timeline_mkmbcabh')
        if timeline and '-' in timeline:
            try:
                start = datetime.strptime(timeline.split(' - ')[0].strip(), '%Y-%m-%d')
                if start.year == target_year and start.month == target_month:
                    result.append(row)
            except Exception as e:
                print(f"Skipping row due to date error: {e}")
    return result


def get_countries_of_incidents(incidents_list):
    countries = {}
    for row in incidents_list:
        country = row.get('country_mkmb91h3')
        if country:
            countries[country] = countries.get(country, 0) + 1
    return countries


def count_by_incident_status(incidents_list):
    """Pipeline breakdown for the management overview dashboard — how many
    incidents sit in each workflow stage right now. Every real status
    starts at 0 so a stage nobody is currently in still shows up as empty,
    not missing."""
    counts = {label: 0 for label in dict.fromkeys(INCIDENT_STATUS_TRANSLATIONS.values())}
    for row in incidents_list:
        raw = (row.get('status_mkmbjwef') or '').strip()
        label = INCIDENT_STATUS_TRANSLATIONS.get(raw, raw)
        if label:
            counts[label] = counts.get(label, 0) + 1
    return counts


def count_active_workload(incidents_list, column_id, translations):
    """How many non-Done incidents are currently assigned to each person on
    a given roster column (CCC official / incident manager / supervisor) —
    Done cases are excluded since they're no longer anyone's active load."""
    counts = {}
    for row in incidents_list:
        if (row.get('status_mkmbjwef') or '').strip() == 'Done':
            continue
        raw = (row.get(column_id) or '').strip()
        name = translations.get(raw, raw)
        if name:
            counts[name] = counts.get(name, 0) + 1
    return counts


def get_our_impact(incidents_list):
    life_threatening = 0
    lives_saved = 0
    for row in incidents_list:
        if row.get('check_mkn3c7v8'):
            life_threatening += 1
        if row.get('color_mkvvrm1r') == SIGNIFICANT_INCIDENT:
            lives_saved += 1
    return {
        'count_life_saved': lives_saved,
        'count_life_threatening_incidents': life_threatening
    }

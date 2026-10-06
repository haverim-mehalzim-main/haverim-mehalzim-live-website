"""
WhatsApp incident report — when a caller opens a call on the website, send the
team a Hebrew summary of the case through WhatSable's send API.

Best-effort by design (same stance as email_service): the call is already
saved on Monday and in our DB by the time this runs, so a WhatsApp failure is
logged and swallowed — it must never fail or slow down opening a call. The
send runs on a background thread for the same reason.

Config (app.config): WHATSABLE_API_KEY, WHATSAPP_REPORT_TO (E.164 recipient).
When either is unset the report is skipped.
"""

import threading
from datetime import datetime, timezone

import requests

from app.config import WHATSABLE_API_KEY, WHATSAPP_REPORT_TO, WHATSABLE_SEND_URL
from app.features.incidents.constants import GENDER_TRANSLATIONS, INCIDENT_TYPE_TRANSLATIONS

try:
    from zoneinfo import ZoneInfo
    _REPORT_TZ = ZoneInfo("Asia/Jerusalem")
except Exception:  # tzdata missing on the host — fall back to UTC rather than fail
    _REPORT_TZ = timezone.utc

_HEBREW_TYPE = {english: hebrew for hebrew, english in INCIDENT_TYPE_TRANSLATIONS.items()}
_HEBREW_GENDER = {english: hebrew for hebrew, english in GENDER_TRANSLATIONS.items()}

# WhatsApp caps a text message at 4096 characters; stay under it.
_MAX_MESSAGE_LEN = 4000


def is_configured() -> bool:
    return bool(WHATSABLE_API_KEY and WHATSAPP_REPORT_TO)


def _line(label: str, value) -> str | None:
    value = "" if value is None else str(value).strip()
    return f"{label}: {value}" if value else None


def _section(title: str, lines: list) -> list:
    lines = [ln for ln in lines if ln]
    return [title, *lines, ""] if lines else []


def build_incident_report(
    *,
    incident_type: str,
    description: str,
    city: str,
    country_name: str,
    filer_name: str,
    filer_phone: str = "",
    patient_name: str,
    patient_age: int | None = None,
    patient_gender: str = "",
    patient_phone: str = "",
    monday_item_id: str = "",
    opened_at: datetime | None = None,
) -> str:
    """The report text, in the team's standard "דוח אירוע" layout. Only fields
    the website actually collects are included; optional ones are left out
    when empty."""
    opened_at = (opened_at or datetime.now(timezone.utc)).astimezone(_REPORT_TZ)

    parts = [
        "🚨 דוח אירוע חברים מחלצים",
        f"תאריך/שעה: {opened_at.strftime('%d/%m/%Y %H:%M')}",
        "",
    ]
    parts += _section("סיווג האירוע", [
        _line("סוג", _HEBREW_TYPE.get(incident_type, incident_type)),
        _line("תיאור", description),
    ])
    parts += _section("מיקום", [
        _line("מדינה", country_name),
        _line("עיר", city),
    ])
    parts += _section("פרטי המדווח", [
        _line("שם מלא", filer_name),
        _line("טלפון", filer_phone),
    ])
    parts += _section("פרטי הנפגע", [
        _line("שם מלא", patient_name),
        _line("טלפון", patient_phone),
        _line("מגדר", _HEBREW_GENDER.get(patient_gender, patient_gender)),
        _line("גיל", patient_age),
    ])
    if monday_item_id:
        parts.append(f"מזהה אירוע: {monday_item_id}")

    return "\n".join(parts).strip()[:_MAX_MESSAGE_LEN]


def send_message(text: str) -> bool:
    """POST one text message to WHATSAPP_REPORT_TO. Never raises."""
    if not is_configured():
        print("[whatsapp] not configured (WHATSABLE_API_KEY / WHATSAPP_REPORT_TO) — report skipped")
        return False
    try:
        resp = requests.post(
            WHATSABLE_SEND_URL,
            json={"to": WHATSAPP_REPORT_TO, "text": text},
            headers={"Authorization": WHATSABLE_API_KEY, "Content-Type": "application/json"},
            timeout=15,
        )
        try:
            data = resp.json()
        except ValueError:
            data = {}
        if resp.status_code == 200 and data.get("success", True):
            return True
        print(f"[whatsapp] send failed: HTTP {resp.status_code} {data or resp.text[:200]}")
    except Exception as e:
        print(f"[whatsapp] send error: {e}")
    return False


def send_incident_report_in_background(**report_fields) -> None:
    """Build the report now (cheap, no I/O) and send it on a daemon thread so
    the caller's request returns immediately."""
    if not is_configured():
        print("[whatsapp] not configured (WHATSABLE_API_KEY / WHATSAPP_REPORT_TO) — report skipped")
        return
    try:
        text = build_incident_report(**report_fields)
    except Exception as e:
        print(f"[whatsapp] could not build report: {e}")
        return
    threading.Thread(target=send_message, args=(text,), daemon=True).start()

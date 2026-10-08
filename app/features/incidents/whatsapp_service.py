"""
WhatsApp incident report — when a caller opens a call on the website, send the
team a Hebrew summary of the case through WhatSable's send API.

Best-effort by design (same stance as email_service): the call is already
saved on Monday and in our DB by the time this runs, so a WhatsApp failure is
logged and swallowed — it must never fail or slow down opening a call. The
send runs on a background thread for the same reason.

Config (app.config): WHATSABLE_API_KEY, WHATSAPP_BUSINESS_NUMBER (the recipient).
When either is unset the report is skipped.
"""

import re
import threading
from datetime import datetime, timezone

import requests

from app.config import PUBLIC_BASE_URL, WHATSABLE_API_KEY, WHATSAPP_BUSINESS_NUMBER, WHATSABLE_SEND_URL
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


def to_e164(number: str) -> str:
    """WhatSable wants E.164 (+972501234567). Accepts what people actually
    type: spaces or dashes, "00972...", "972...", or an Israeli "050..." number."""
    raw = (number or "").strip()
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return ""
    if raw.startswith("+"):
        return "+" + digits
    if digits.startswith("00"):
        return "+" + digits[2:]
    if digits.startswith("0"):
        return "+972" + digits[1:]
    return "+" + digits


def is_configured() -> bool:
    return bool(WHATSABLE_API_KEY and to_e164(WHATSAPP_BUSINESS_NUMBER))


_LRM = "\u200e"  # keeps "+972 50..." reading left-to-right inside a Hebrew line
_RULE = "━━━━━━━━━━━━━━━"
_TRUNCATION_NOTE = "…\n(התיאור המלא באפליקציה)"


def _plain(value) -> str:
    """User-typed text with WhatsApp's formatting characters defused, so a
    stray "*" or "_text_" in a description can't bold/italicise (or break)
    the report. Look-alike characters, one for one, so the length is
    unchanged; underscores inside words (links, handles) are left alone."""
    text = "" if value is None else str(value).strip()
    text = text.replace("*", "∗").replace("~", "∼").replace("`", "ˋ")
    text = re.sub(r"(?<!\w)_(?=\S)|(?<=\S)_(?!\w)", "＿", text)
    return text


def _line(label: str, value, *, ltr: bool = False) -> str | None:
    value = _plain(value)
    if not value:
        return None
    if ltr:
        value = f"{_LRM}{value}{_LRM}"
    return f"*{label}:* {value}"


def _quote(text: str) -> str:
    """WhatsApp quote block: every line prefixed with "> "."""
    return "\n".join(f"> {ln}" if ln.strip() else ">" for ln in text.splitlines())


def _section(emoji: str, title: str, lines: list) -> list:
    lines = [ln for ln in lines if ln]
    return [f"{emoji} *{title}*", *lines, ""] if lines else []


def _compose(*, description: str, **f) -> str:
    opened_at = f["opened_at"]
    description = _plain(description)

    parts = [
        "🚨 *דוח אירוע חדש | חברים מחלצים*",
        f"🗓️ {opened_at.strftime('%d/%m/%Y')} · {opened_at.strftime('%H:%M')}",
        _RULE,
        "",
    ]
    classification = [_line("סוג", _HEBREW_TYPE.get(f["incident_type"], f["incident_type"]))]
    if description:
        classification += ["*תיאור:*", _quote(description)]
    parts += _section("📋", "סיווג האירוע", classification)
    parts += _section("📍", "מיקום", [
        _line("מדינה", f["country_name"]),
        _line("עיר", f["city"]),
    ])
    parts += _section("👤", "פרטי המדווח", [
        _line("שם מלא", f["filer_name"]),
        _line("טלפון", f["filer_phone"], ltr=True),
    ])
    parts += _section("🩺", "פרטי הנפגע", [
        _line("שם מלא", f["patient_name"]),
        _line("טלפון", f["patient_phone"], ltr=True),
        _line("מגדר", _HEBREW_GENDER.get(f["patient_gender"], f["patient_gender"])),
        _line("גיל", f["patient_age"]),
    ])

    parts.append(_RULE)
    if f["incident_url"]:
        parts += ["🔗 *לפתיחת האירוע באפליקציה*", f["incident_url"], ""]
    if f["monday_item_id"]:
        parts.append(f"🆔 מזהה אירוע: {f['monday_item_id']}")
    return "\n".join(parts).strip()


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
    incident_id: int | None = None,
    opened_at: datetime | None = None,
) -> str:
    """The report text, in the team's standard "דוח אירוע" layout, styled with
    WhatsApp's text formatting. Only fields the website actually collects are
    included; optional ones are left out when empty. The form caps every field
    well below WhatsApp's 4096-character limit, but if a report would ever
    exceed it, the description (the only free-text field) is shortened — never
    the link or the event id at the bottom."""
    fields = dict(
        incident_type=incident_type, city=city, country_name=country_name,
        filer_name=filer_name, filer_phone=filer_phone, patient_name=patient_name,
        patient_age=patient_age, patient_gender=patient_gender, patient_phone=patient_phone,
        monday_item_id=monday_item_id,
        incident_url=f"{PUBLIC_BASE_URL}/incidents/{incident_id}" if PUBLIC_BASE_URL and incident_id else "",
        opened_at=(opened_at or datetime.now(timezone.utc)).astimezone(_REPORT_TZ),
    )

    text = _compose(description=description, **fields)
    overflow = len(text) - _MAX_MESSAGE_LEN
    if overflow > 0:
        keep = max(0, len(description.strip()) - overflow - len(_TRUNCATION_NOTE) - 8)
        text = _compose(description=description.strip()[:keep].rstrip() + _TRUNCATION_NOTE, **fields)
    return text[:_MAX_MESSAGE_LEN]


def send_message(text: str) -> bool:
    """POST one text message to WHATSAPP_BUSINESS_NUMBER. Never raises."""
    if not is_configured():
        print("[whatsapp] not configured (WHATSABLE_API_KEY / WHATSAPP_BUSINESS_NUMBER) — report skipped")
        return False
    try:
        resp = requests.post(
            WHATSABLE_SEND_URL,
            json={"to": to_e164(WHATSAPP_BUSINESS_NUMBER), "text": text},
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
        print("[whatsapp] not configured (WHATSABLE_API_KEY / WHATSAPP_BUSINESS_NUMBER) — report skipped")
        return
    try:
        text = build_incident_report(**report_fields)
    except Exception as e:
        print(f"[whatsapp] could not build report: {e}")
        return
    threading.Thread(target=send_message, args=(text,), daemon=True).start()

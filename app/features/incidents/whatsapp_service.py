"""
WhatsApp incident report — when a caller opens a call on the website, send the
team a Hebrew summary of the case through WhatSable's send API.

Best-effort by design (same stance as email_service): the call is already
saved on Monday and in our DB by the time this runs, so a WhatsApp failure is
logged and swallowed — it must never fail or slow down opening a call. The
send runs on a background thread for the same reason.

Config (app.config): WHATSABLE_API_KEY, WHATSAPP_BUSINESS_NUMBER (the recipient).
When either is unset the report is skipped.

Shape of the report — WhatSable does not send free-form text. It slots the text
into one of its pre-approved WhatsApp templates (standard_N_line_textonly),
chosen by how many lines the text has, and WhatsApp forbids line breaks inside
a template variable. So the report is at most MAX_LINES lines, each a single
line (no newlines inside), and the whole text has to fit a template body
(1024 characters), which is why the description is shortened when long — the
full text is one tap away on the incident page.
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
_SEP = "  |  "
MAX_LINES = 5
# A template body is limited to 1024 characters; stay a little under it.
_MAX_MESSAGE_LEN = 1000
_ELLIPSIS = "…"

# Short fields are capped in the message (the form allows 200); the full
# values are on the incident page.
_SHORT_FIELD_MAX = 60


def _plain(value, *, limit: int | None = None) -> str:
    """User-typed text made safe for one template line: formatting characters
    defused (a stray "*" or "_text_" can't bold/italicise the report —
    look-alike characters, one for one), line breaks and runs of whitespace
    collapsed into single spaces (a template variable can't hold a newline or
    more than four spaces in a row). Underscores inside words (links,
    handles) are left alone."""
    text = "" if value is None else str(value)
    text = text.replace("*", "∗").replace("~", "∼").replace("`", "ˋ")
    text = re.sub(r"(?<!\w)_(?=\S)|(?<=\S)_(?!\w)", "＿", text)
    text = re.sub(r"\s+", " ", text).strip()
    if limit is not None and len(text) > limit:
        text = text[: limit - 1].rstrip() + _ELLIPSIS
    return text


def _field(label: str, value, *, ltr: bool = False, limit: int | None = _SHORT_FIELD_MAX) -> str | None:
    value = _plain(value, limit=limit)
    if not value:
        return None
    if ltr:
        value = f"{_LRM}{value}{_LRM}"
    return f"*{label}:* {value}"


def _join(parts: list) -> str:
    return _SEP.join(p for p in parts if p)


def _compose(*, description: str, f: dict) -> str:
    opened_at = f["opened_at"]
    place = ", ".join(p for p in (_plain(f["city"], limit=_SHORT_FIELD_MAX), _plain(f["country_name"], limit=_SHORT_FIELD_MAX)) if p)
    patient_bits = " · ".join(b for b in (
        _plain(f["patient_name"], limit=_SHORT_FIELD_MAX),
        f"גיל {f['patient_age']}" if f["patient_age"] not in (None, "") else "",
        _plain(_HEBREW_GENDER.get(f["patient_gender"], f["patient_gender"])),
        f"{_LRM}{_plain(f['patient_phone'], limit=40)}{_LRM}" if _plain(f["patient_phone"]) else "",
    ) if b)
    reporter_bits = " · ".join(b for b in (
        _plain(f["filer_name"], limit=_SHORT_FIELD_MAX),
        f"{_LRM}{_plain(f['filer_phone'], limit=40)}{_LRM}" if _plain(f["filer_phone"]) else "",
    ) if b)

    lines = [
        f"🚨 *דוח אירוע חדש | חברים מחלצים*{_SEP}🗓️ {opened_at.strftime('%d/%m/%Y')} · {opened_at.strftime('%H:%M')}",
        _join([
            _field("סיווג", _HEBREW_TYPE.get(f["incident_type"], f["incident_type"])),
            f"📍 *מיקום:* {place}" if place else "",
        ]),
        f"📝 *תיאור:* {_plain(description)}" if _plain(description) else "",
        _join([
            f"👤 *מדווח:* {reporter_bits}" if reporter_bits else "",
            f"🩺 *נפגע:* {patient_bits}" if patient_bits else "",
        ]),
        _join([
            f"🔗 {f['incident_url']}" if f["incident_url"] else "",
            f"🆔 {f['monday_item_id']}" if f["monday_item_id"] else "",
        ]),
    ]
    return "\n".join(ln for ln in lines if ln)


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
    """The report text, in the team's standard "דוח אירוע" layout, as at most
    MAX_LINES single-line rows (see the module docstring for why). Only fields
    the website actually collects are included; optional ones are left out
    when empty. When the whole thing would not fit a template body, the
    description — the only long free-text field — is shortened, never the
    link or the event id."""
    fields = dict(
        incident_type=incident_type, city=city, country_name=country_name,
        filer_name=filer_name, filer_phone=filer_phone, patient_name=patient_name,
        patient_age=patient_age, patient_gender=patient_gender, patient_phone=patient_phone,
        monday_item_id=monday_item_id,
        incident_url=f"{PUBLIC_BASE_URL}/incidents/{incident_id}" if PUBLIC_BASE_URL and incident_id else "",
        opened_at=(opened_at or datetime.now(timezone.utc)).astimezone(_REPORT_TZ),
    )

    text = _compose(description=description, f=fields)
    overflow = len(text) - _MAX_MESSAGE_LEN
    if overflow > 0:
        shortened = _plain(description)
        keep = max(0, len(shortened) - overflow - 1)
        text = _compose(description=shortened[:keep].rstrip() + _ELLIPSIS, f=fields)
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

"""
WhatsApp incident report — when a caller opens a call on the website, send the
team a Hebrew summary of the case.

Two routes, one report:
  - the incident-management agent (agent_service) — preferred when configured.
    It posts to the team's WhatsApp group as a normal message, so the report
    gets the full, spacious layout (build_rich_report);
  - WhatSable's send API — the original route, kept as the fallback if the
    agent can't be reached. It sends through pre-made templates (see the note
    on the compact report below), hence its own, tighter layout.

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
from app.features.incidents import agent_service
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


# ── Rich report (for the agent) ─────────────────────────────────────────────
# A normal WhatsApp message: sections, bold labels, a quoted description. No
# template, so no line limit — only WhatsApp's 4096-character message cap, which
# the form's field limits keep the report well under (largest possible: ~3,100).

_RICH_RULE = "━━━━━━━━━━━━━━━"
_RICH_TRUNCATION_NOTE = "…\n(התיאור המלא באפליקציה)"
_RICH_MAX_LEN = 4000


def _rich_plain(value) -> str:
    """User-typed text with WhatsApp's formatting characters defused, so a
    stray "*" or "_text_" in a description can't bold/italicise (or break) the
    report. Look-alike characters, one for one, so the length is unchanged;
    underscores inside words (links, handles) are left alone."""
    text = "" if value is None else str(value).strip()
    text = text.replace("*", "∗").replace("~", "∼").replace("`", "ˋ")
    text = re.sub(r"(?<!\w)_(?=\S)|(?<=\S)_(?!\w)", "＿", text)
    return text


def _rich_line(label: str, value, *, ltr: bool = False) -> str | None:
    value = _rich_plain(value)
    if not value:
        return None
    if ltr:
        value = f"\u200e{value}\u200e"  # keeps "+972 50..." left-to-right inside a Hebrew line
    return f"*{label}:* {value}"


def _rich_quote(text: str) -> str:
    """WhatsApp quote block: every line prefixed with "> "."""
    return "\n".join(f"> {ln}" if ln.strip() else ">" for ln in text.splitlines())


def _rich_section(emoji: str, title: str, lines: list) -> list:
    lines = [ln for ln in lines if ln]
    return [f"{emoji} *{title}*", *lines, ""] if lines else []


def _rich_compose(*, description: str, f: dict) -> str:
    opened_at = f["opened_at"]
    description = _rich_plain(description)

    parts = [
        "🚨 *דוח אירוע חדש | חברים מחלצים*",
        f"🗓️ {opened_at.strftime('%d/%m/%Y')} · {opened_at.strftime('%H:%M')}",
        _RICH_RULE,
        "",
    ]
    classification = [_rich_line("סוג", _HEBREW_TYPE.get(f["incident_type"], f["incident_type"]))]
    if description:
        classification += ["*תיאור:*", _rich_quote(description)]
    parts += _rich_section("📋", "סיווג האירוע", classification)
    parts += _rich_section("📍", "מיקום", [
        _rich_line("מדינה", f["country_name"]),
        _rich_line("עיר", f["city"]),
    ])
    parts += _rich_section("👤", "פרטי המדווח", [
        _rich_line("שם מלא", f["filer_name"]),
        _rich_line("טלפון", f["filer_phone"], ltr=True),
    ])
    parts += _rich_section("🩺", "פרטי הנפגע", [
        _rich_line("שם מלא", f["patient_name"]),
        _rich_line("טלפון", f["patient_phone"], ltr=True),
        _rich_line("מגדר", _HEBREW_GENDER.get(f["patient_gender"], f["patient_gender"])),
        _rich_line("גיל", f["patient_age"]),
    ])

    parts.append(_RICH_RULE)
    if f["incident_url"]:
        parts += ["🔗 *לפתיחת האירוע באפליקציה*", f["incident_url"], ""]
    if f["monday_item_id"]:
        parts.append(f"🆔 מזהה אירוע: {f['monday_item_id']}")
    return "\n".join(parts).strip()


def _rich_fields(report: dict) -> dict:
    """The fields the rich layout is built from, with the incident link and the
    opening time resolved once."""
    incident_id = report.get("incident_id")
    return dict(
        incident_type=report["incident_type"], city=report["city"], country_name=report["country_name"],
        filer_name=report["filer_name"], filer_phone=report.get("filer_phone", ""),
        patient_name=report["patient_name"], patient_age=report.get("patient_age"),
        patient_gender=report.get("patient_gender", ""), patient_phone=report.get("patient_phone", ""),
        monday_item_id=report.get("monday_item_id", ""),
        incident_url=f"{PUBLIC_BASE_URL}/incidents/{incident_id}" if PUBLIC_BASE_URL and incident_id else "",
        opened_at=(report.get("opened_at") or datetime.now(timezone.utc)).astimezone(_REPORT_TZ),
    )


def build_rich_report(*, description: str, **report) -> str:
    """The spacious report text for a normal WhatsApp message. If it would ever
    exceed WhatsApp's cap, only the description (the one long free-text field)
    is shortened — never the link or the event id at the bottom."""
    fields = _rich_fields(report)
    text = _rich_compose(description=description, f=fields)
    overflow = len(text) - _RICH_MAX_LEN
    if overflow > 0:
        keep = max(0, len(description.strip()) - overflow - len(_RICH_TRUNCATION_NOTE) - 8)
        text = _rich_compose(description=description.strip()[:keep].rstrip() + _RICH_TRUNCATION_NOTE, f=fields)
    return text[:_RICH_MAX_LEN]


def build_agent_payload(*, description: str, **report) -> dict:
    """What the agent receives: the ready-made message text (it forwards it as
    is) plus the structured fields, for anything it wants to do with them."""
    fields = _rich_fields(report)
    return {
        "event": "incident.opened",
        "incident_id": report.get("incident_id"),
        "monday_item_id": fields["monday_item_id"],
        "opened_at": fields["opened_at"].isoformat(),
        "incident_type": fields["incident_type"],
        "country": fields["country_name"],
        "city": fields["city"],
        "description": description,
        "reporter": {"name": fields["filer_name"], "phone": fields["filer_phone"]},
        "patient": {
            "name": fields["patient_name"], "age": fields["patient_age"],
            "gender": fields["patient_gender"], "phone": fields["patient_phone"],
        },
        "incident_url": fields["incident_url"],
        "report_text": build_rich_report(description=description, **report),
    }


# ── Compact report (for WhatSable) ──────────────────────────────────────────
# WhatSable does not send free-form text (see the module docstring), so this
# layout is the five-line one described there.

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


def _deliver(agent_payload: dict | None, compact_text: str | None) -> None:
    """The agent first; WhatSable only if the agent did not take the report (or
    isn't configured). Runs on the background thread."""
    if agent_payload is not None:
        if agent_service.send_report(agent_payload):
            return
        print("[whatsapp] agent did not take the report" + (" — falling back to WhatSable" if compact_text else " and no fallback is configured"))
    if compact_text is not None:
        send_message(compact_text)


def send_incident_report_in_background(**report_fields) -> None:
    """Build the report now (cheap, no I/O) and deliver it on a daemon thread so
    the caller's request returns immediately. Goes to the agent when one is
    configured, with WhatSable as the fallback; otherwise to WhatSable alone."""
    use_agent = agent_service.is_configured()
    use_whatsable = is_configured()
    if not use_agent and not use_whatsable:
        print("[whatsapp] neither the agent nor WhatSable is configured — report skipped")
        return
    # Both layouts show the same opening time
    report_fields.setdefault("opened_at", datetime.now(timezone.utc))
    try:
        agent_payload = build_agent_payload(**report_fields) if use_agent else None
        compact_text = build_incident_report(**report_fields) if use_whatsable else None
    except Exception as e:
        print(f"[whatsapp] could not build report: {e}")
        return
    threading.Thread(target=_deliver, args=(agent_payload, compact_text), daemon=True).start()

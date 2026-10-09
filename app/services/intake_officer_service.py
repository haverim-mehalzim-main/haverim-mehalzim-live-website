"""
The officers allowed to talk to the incident agent on WhatsApp, managed by admins.

The website is the source of truth: every add or remove saves here and then pushes
the whole active list to the agent (agent_service.push_officers), which uses it from
its next message, without a restart. A failed push never loses the change — it is
saved here, the admin is told the agent was not updated, and "Sync now" (or the
automatic sync when the site starts) sends it again.
"""

import re
from datetime import datetime, timezone

from app.extensions import db
from app.features.incidents import agent_service, whatsapp_service
from app.models import IntakeOfficer

_MIN_DIGITS = 8
_MAX_DIGITS = 15
_MAX_NAME = 80


class OfficerError(Exception):
    """A problem the admin can fix (bad number, missing name, duplicate...)."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def normalize_phone(raw: str) -> str:
    """Any common way of writing a number (050-123 4567, +972 50..., 00972...) ->
    "+<digits>" (E.164). Refuses what can't be a phone number."""
    e164 = whatsapp_service.to_e164(raw or "")
    digits = re.sub(r"\D", "", e164)
    if not (_MIN_DIGITS <= len(digits) <= _MAX_DIGITS):
        raise OfficerError("Please enter a valid WhatsApp number with its country code, e.g. +972 50 123 4567.")
    return f"+{digits}"


def clean_name(raw: str) -> str:
    name = re.sub(r"\s+", " ", (raw or "")).strip()
    if len(name) < 2:
        raise OfficerError("The officer's name is required. The agent greets them by it and records it on every report.")
    return name[:_MAX_NAME]


def list_active() -> list:
    return (
        IntakeOfficer.query
        .filter(IntakeOfficer.removed_at.is_(None))
        .order_by(IntakeOfficer.full_name)
        .all()
    )


def add(*, phone: str, full_name: str, admin) -> IntakeOfficer:
    """Add an officer (or reactivate a removed one with that number, updating the name).
    Commits."""
    number = normalize_phone(phone)
    name = clean_name(full_name)

    officer = IntakeOfficer.query.filter_by(phone=number).one_or_none()
    if officer is not None and officer.removed_at is None:
        raise OfficerError(f"{officer.full_name} already has access with this number.", 409)
    if officer is None:
        officer = IntakeOfficer(phone=number, full_name=name, added_by_user_id=admin.id)
        db.session.add(officer)
    else:
        officer.full_name = name
        officer.added_by_user_id = admin.id
        officer.created_at = datetime.now(timezone.utc)
        officer.removed_at = None
        officer.removed_by_user_id = None
    db.session.commit()
    print(f"[officers] access granted by user {admin.id} (...{number[-4:]})")
    return officer


def remove(officer: IntakeOfficer, *, admin) -> None:
    """Revoke access. The row stays, marked removed. Commits."""
    if officer.removed_at is None:
        officer.removed_at = datetime.now(timezone.utc)
        officer.removed_by_user_id = admin.id
        db.session.commit()
        print(f"[officers] access revoked by user {admin.id} (...{officer.phone[-4:]})")


def agent_payload() -> list:
    """The list as the agent wants it: digits only, plus the name."""
    return [{"number": o.phone.lstrip("+"), "name": o.full_name} for o in list_active()]


def sync(*, retry: bool = False):
    """Push the full active list to the agent. True/False for success, None when the
    agent isn't configured here at all."""
    if not agent_service.is_configured():
        return None
    # Never push a list nobody has ever managed. The agent treats a received list as
    # the only truth, so an empty one sent before any officer was added here would
    # lock out everyone on its old DM_ALLOWED_NUMBERS list. After officers have been
    # managed, an empty list is legitimate (the last one was removed) and is sent.
    if IntakeOfficer.query.count() == 0:
        return None
    return agent_service.push_officers(agent_payload(), retry=retry)

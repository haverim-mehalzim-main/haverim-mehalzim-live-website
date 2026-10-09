"""
Email every volunteer when a case becomes "Working on it".

That status is the moment a case is open to volunteers: a case opened through
the site starts as "New Request by User" and only an admin's approval moves it
there, and a case staff enter straight on Monday usually arrives already
there. Hooking the status (not the creation) covers both.

How it avoids ever sending twice or sending for a failed save:
  1. claim_if_newly_in_progress() atomically stamps Incident.volunteers_notified_at
     (UPDATE ... WHERE it is still NULL). Only the caller whose UPDATE changes a
     row wins, so the Monday webhook, the reconcile job, an admin loading a
     dashboard and the Approve button can all see the same transition safely.
  2. The recipients are read at claim time and parked on the session.
  3. The emails go out from an after_commit hook, on a background thread — so a
     rolled-back transaction sends nothing, and a slow mail provider never
     slows a request.

Best-effort: a mail failure is logged and never raises into the caller.
"""

import threading

from sqlalchemy import event, func, update

from app.config import PUBLIC_BASE_URL, VOLUNTEER_ALERTS_ENABLED
from app.extensions import db
from app.features.incidents import email_service
from app.features.incidents.constants import INCIDENT_TYPE_TRANSLATIONS
from app.models import Incident, Role, User, UserRole, UserStatus

_IN_PROGRESS = 'Working on it'
_STATUS_COL  = 'status_mkmbjwef'
_TYPE_COL    = 'status_mkmb1zc6'
_COUNTRY_COL = 'country_mkmb91h3'
_URGENT_COL  = 'check_mkn3c7v8'
_PENDING_KEY = 'volunteer_alerts'

_EN_TO_HE = {english: hebrew for hebrew, english in INCIDENT_TYPE_TRANSLATIONS.items()}


def _volunteer_recipients() -> list[tuple[str, str]]:
    """Every active volunteer with a verified email: (email, full name)."""
    rows = (
        db.session.query(User.email, User.full_name)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .filter(
            Role.name == 'volunteer',
            UserRole.revoked_at.is_(None),
            User.status == UserStatus.ACTIVE,
            User.email_verified_at.isnot(None),
        )
        .all()
    )
    return [(email, name) for email, name in rows if email]


def claim_if_newly_in_progress(incident: Incident, monday_row: dict) -> bool:
    """If `monday_row` shows this case as "Working on it" and volunteers haven't
    been alerted yet, claim the alert and queue it for after the commit.
    Rows without a status (e.g. the bare {'id': ...} the reject route passes)
    never trigger anything. Returns True if this call claimed the alert."""
    if (monday_row.get(_STATUS_COL) or '').strip() != _IN_PROGRESS:
        return False
    if incident.volunteers_notified_at is not None:
        return False

    db.session.flush()  # a brand-new shadow row needs its id
    claimed = db.session.execute(
        update(Incident)
        .where(Incident.id == incident.id, Incident.volunteers_notified_at.is_(None))
        .values(volunteers_notified_at=func.now())
    )
    if claimed.rowcount != 1:
        return False  # someone else got there first
    db.session.expire(incident, ['volunteers_notified_at'])

    if not VOLUNTEER_ALERTS_ENABLED:
        print(f"[volunteer_alert] alerts disabled — case {incident.monday_item_id} stamped, nothing sent")
        return True

    raw_type = (monday_row.get(_TYPE_COL) or '').strip()
    type_en = INCIDENT_TYPE_TRANSLATIONS.get(raw_type, raw_type)
    type_he = raw_type if raw_type in INCIDENT_TYPE_TRANSLATIONS else _EN_TO_HE.get(raw_type, raw_type)
    db.session.info.setdefault(_PENDING_KEY, []).append({
        'case_url':   f"{PUBLIC_BASE_URL}/incidents/{incident.id}",
        'type_en':    type_en or 'Incident',
        'type_he':    type_he or type_en or 'אירוע',
        'country':    (monday_row.get(_COUNTRY_COL) or '').strip(),
        'urgent':     bool((monday_row.get(_URGENT_COL) or '').strip()),
        'recipients': _volunteer_recipients(),
        'monday_id':  incident.monday_item_id,
    })
    return True


def _send_all(alerts: list[dict]) -> None:
    for alert in alerts:
        sent = failed = 0
        for email, name in alert['recipients']:
            ok = email_service.send_new_case_alert(
                to_email=email, to_name=name, case_url=alert['case_url'], type_en=alert['type_en'],
                type_he=alert['type_he'], country=alert['country'], urgent=alert['urgent'],
            )
            sent, failed = sent + ok, failed + (not ok)
        print(f"[volunteer_alert] case {alert['monday_id']}"
              f"{' (urgent)' if alert['urgent'] else ''}: {sent} sent, {failed} failed, "
              f"{len(alert['recipients'])} volunteers")


@event.listens_for(db.session, 'after_commit')
def _send_after_commit(session):
    alerts = session.info.pop(_PENDING_KEY, None)
    if alerts:
        threading.Thread(target=_send_all, args=(alerts,), daemon=True).start()


@event.listens_for(db.session, 'after_rollback')
def _drop_on_rollback(session):
    session.info.pop(_PENDING_KEY, None)

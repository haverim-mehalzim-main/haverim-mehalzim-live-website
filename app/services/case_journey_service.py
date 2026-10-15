"""
When each step of a case's journey was completed, and the automatic completion
of step 1.

Monday stores one thing about the journey: the CURRENT stage (Case Stage). It
never records when an earlier step finished, so the times families see are kept
here, in case_step_events. Three things write to the stage — staff on Monday,
the WhatsApp agent (which only ever writes Monday), and our own step-1 advance —
and all three are noticed the same way: every time a Monday row passes through
sync_local_incidents_from_monday (webhook, reconcile job, admin dashboard) we
compare its step with the one we last saw, and stamp the steps in between. So
there is one code path for "a step completed", whoever did it.

The time recorded is when we noticed, not when the person clicked: the Monday
webhook makes that seconds, and the reconcile job is the fallback if one is lost.

Step 1 ("Request Received") completes by itself 30-60s after a case arrives, so a
family sees movement within a minute instead of a page that sits still until a
person gets to it. The delay is drawn once and stored (Incident.step1_due_at):
random per case, but never re-rolled on a refresh. It is real, not cosmetic: the
worker writes "2. Situation Assessment" to Monday, so the board, the staff pages
and the family page always agree. It only fires if the case is still at step 1
when the time comes — a person who moved it on first wins.

Only a case that ARRIVES gets scheduled (opened on the site, or created on Monday
while the webhook is live). Cases that already exist are never scheduled, so a
deploy can't suddenly push every old step-1 case on the board forward.

Single gunicorn worker (railway.json), so one worker thread. The claim below is
still atomic, so a second process could not double-advance a case.
"""

import random
import threading
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import update

from app.extensions import db
from app.features.incidents.tracker_service import _parse_step
from app.models import CaseStepEvent, Incident

_STAGE_COL  = 'color_mm32c8wh'
_STATUS_COL = 'status_mkmbjwef'
_DONE_STATUS = 'Done'
_TOTAL_STEPS = 8

# Seconds after a case arrives before step 1 completes — random per case, so the
# page doesn't tick over at the same instant for everyone.
_STEP1_DELAY_RANGE = (30, 60)
_STEP2_LABEL = '2. Situation Assessment'
# A step-1 case's stage reads as one of these (the board has a near-duplicate
# label without the number, and a brand-new item can be blank).
_STEP1_LABELS = {'', 'request received', '1. request received'}

# If writing to Monday fails, try again this soon (it is retried until it works).
_RETRY_SECONDS = 30
_WORKER_INTERVAL = 5
_BATCH = 20

_worker_started = False


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _step_of(row: dict) -> int:
    return _parse_step((row.get(_STAGE_COL) or '').strip())['step']


def _record(incident: Incident, step: int, source: str, when: datetime | None = None) -> None:
    """Stamp `step` as completed — first time wins, so a stage that moves back and
    forth keeps its original time."""
    exists = (
        db.session.query(CaseStepEvent.id)
        .filter_by(incident_id=incident.id, step=step)
        .first()
    )
    if exists is None:
        db.session.add(CaseStepEvent(incident_id=incident.id, step=step, completed_at=when or _now(), source=source))


def start_new_case(incident: Incident) -> None:
    """A case that has just arrived: remember it is at step 1 and schedule step 1
    to complete in 30-60s. Does not commit."""
    incident.case_step_seen = 1
    incident.step1_due_at = _now() + timedelta(seconds=random.uniform(*_STEP1_DELAY_RANGE))


def observe(incident: Incident, row: dict, *, is_new_arrival: bool = False) -> None:
    """Called for every Monday row that passes through the sync. Stamps any steps
    completed since we last looked. `is_new_arrival` marks a case that has just
    been created (see module doc) and so should get step 1 scheduled. Does not
    commit. Rows without the stage column (the bare {'id': ...} some routes pass)
    are ignored."""
    if _STAGE_COL not in row:
        return
    db.session.flush()  # a brand-new shadow row needs its id before events point at it

    step = _step_of(row)
    seen = incident.case_step_seen

    if seen is None:
        incident.case_step_seen = step
        if is_new_arrival and step == 1:
            start_new_case(incident)
    elif step > seen:
        # Every step between the old and new position completed (a person may
        # jump several at once; they share the time we noticed).
        for done in range(seen, step):
            _record(incident, done, 'monday')
        incident.case_step_seen = step
        incident.step1_due_at = None  # someone moved it on — nothing left to auto-advance
    elif step < seen:
        incident.case_step_seen = step  # moved back by hand; keep the times already recorded

    if (row.get(_STATUS_COL) or '').strip() == _DONE_STATUS and incident.case_step_seen is not None:
        _record(incident, _TOTAL_STEPS, 'monday')


def step_times(monday_item_id: str) -> dict:
    """{step: ISO time} for a case — what the journey shows beside each finished step."""
    rows = (
        db.session.query(CaseStepEvent.step, CaseStepEvent.completed_at)
        .join(Incident, Incident.id == CaseStepEvent.incident_id)
        .filter(Incident.monday_item_id == str(monday_item_id))
        .all()
    )
    return {str(step): _aware(when).isoformat() for step, when in rows}


def _aware(when: datetime) -> datetime:
    # SQLite hands timestamps back naive; Postgres keeps the zone. They are UTC either way.
    return when if when.tzinfo else when.replace(tzinfo=timezone.utc)


# ── The step-1 worker ───────────────────────────────────────────────────────

def advance_due_cases() -> int:
    """Complete step 1 for every case whose time has come. Returns how many it
    advanced. Needs an app context."""
    # Imported here: service.py imports models and the config, and this module is
    # imported by incident_service — a top-level import would be circular.
    from app.features.incidents.service import fetch_incidents_by_ids, update_incident

    due = (
        Incident.query
        .filter(Incident.step1_due_at.isnot(None), Incident.step1_due_at <= _now())
        .limit(_BATCH)
        .all()
    )
    advanced = 0
    for incident in due:
        incident_id, item_id = incident.id, incident.monday_item_id
        # Claim it: only the caller whose UPDATE changes the row proceeds, so it can
        # never be advanced twice.
        claimed = db.session.execute(
            update(Incident)
            .where(Incident.id == incident_id, Incident.step1_due_at.isnot(None), Incident.step1_due_at <= _now())
            .values(step1_due_at=None)
            # No in-Python matching of loaded rows: it compares timezone-naive and
            # aware datetimes and fails; the database does the check atomically.
            .execution_options(synchronize_session=False)
        )
        db.session.commit()
        if claimed.rowcount != 1:
            continue

        incident = db.session.get(Incident, incident_id)
        rows = fetch_incidents_by_ids([item_id])
        if not rows:
            # Monday didn't answer, or the item is gone. A gone item needs nothing;
            # an unreachable Monday must not lose the step, so try again shortly.
            _reschedule(incident)
            continue

        row = rows[0]
        if (row.get(_STAGE_COL) or '').strip().lower() not in _STEP1_LABELS:
            observe(incident, row)  # a person already moved it on: just record that
            db.session.commit()
            continue

        ok, _warnings = update_incident(item_id=item_id, fields={'case_stage': _STEP2_LABEL})
        if not ok:
            _reschedule(incident)
            continue

        _record(incident, 1, 'auto')
        incident.case_step_seen = 2
        db.session.commit()
        advanced += 1
        print(f"[case-journey] case {item_id}: step 1 completed automatically")
    return advanced


def _reschedule(incident: Incident) -> None:
    incident.step1_due_at = _now() + timedelta(seconds=_RETRY_SECONDS)
    db.session.commit()
    print(f"[case-journey] case {incident.monday_item_id}: Monday write failed, retrying in {_RETRY_SECONDS}s")


def start_worker(app) -> None:
    """Run advance_due_cases every few seconds on a background thread. Safe to
    call twice. It never dies on an error."""
    global _worker_started
    if _worker_started:
        return
    _worker_started = True

    def _loop():
        while True:
            try:
                with app.app_context():
                    try:
                        advance_due_cases()
                    finally:
                        db.session.remove()
            except Exception as e:  # noqa: BLE001 — must never kill the thread
                print(f"[case-journey] worker error: {e}")
            time.sleep(_WORKER_INTERVAL)

    threading.Thread(target=_loop, name='case-journey-worker', daemon=True).start()

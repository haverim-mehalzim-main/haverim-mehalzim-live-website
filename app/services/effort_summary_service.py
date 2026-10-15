"""
The effort estimate the WhatsApp agent sends for a finished incident, and the
admin approval that gates it.

The agent computes the estimate (hours per role + how many volunteers took part),
writes the numbers to the Monday board itself, and ALSO posts them here. This site
keeps its own copy because showing them needs a human decision that Monday has no
place for: callers and families see the numbers only after an admin approved THIS
version. A later send replaces the numbers and returns the row to 'pending', so a
revised estimate never inherits an earlier approval.

Besides the five named roles the page shows two more lines: "field operations" (the field
volunteers' hours) and "other volunteers" (HQ volunteers, paramedics, insurance experts and
the incident-wide time such as quiet days). The agent sends both; if it omits "other",
it is whatever the other lines leave of the total, so the breakdown still adds up.
"""

from datetime import datetime, timedelta, timezone

from app.extensions import db
from app.models import EffortSummaryRequest, IncidentEffortSummary, User

PENDING, APPROVED, REJECTED = "pending", "approved", "rejected"
# Where a summary's numbers came from (IncidentEffortSummary.source)
FROM_AGENT, FROM_ADMIN = "agent", "admin"
# States of an admin's "Summarize incident" click (EffortSummaryRequest.state)
REQUESTED, NEEDS_INPUT, FAILED, DONE = "requested", "needs_input", "failed", "done"
_REPORTABLE_STATES = {NEEDS_INPUT, FAILED}  # what the agent may report; it never reports 'requested' or 'done'

# A request the agent never answered. The agent works from memory, so a restart (or a
# crash) silently drops it; after this long the admin is told it failed instead of
# watching "calculating..." forever. Generous: a calculation reads the whole group
# conversation and calls a model, which takes up to a couple of minutes.
REQUEST_STALE_AFTER = timedelta(minutes=10)

# Short codes the agent may report, and the only ones stored. Anything else becomes
# 'agent_error': the reason ends up on an admin page, so it must never be free text.
_KNOWN_REASONS = {
    "needs_input", "case_not_found", "monday_write_failed", "site_rejected", "no_result", "agent_error",
}

# Request field -> model column. The five roles the board tracks, in display order.
ROLE_FIELDS = (
    "supervisors_hours",
    "case_managers_hours",
    "command_center_hours",
    "doctors_hours",
    "mental_health_hours",
)

# Same ceiling for every number: a typo ("4200") or a runaway estimate must not
# reach a family page even through a careless approval click.
_MAX_HOURS = 5000
_MAX_VOLUNTEERS = 1000


class EffortSummaryError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _number(body: dict, key: str, *, required: bool) -> float:
    raw = body.get(key)
    if raw is None:
        if required:
            raise EffortSummaryError(f"'{key}' is required")
        return 0.0
    # bool is an int subclass — "true" must not become 1.0 hours.
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        raise EffortSummaryError(f"'{key}' must be a number")
    value = float(raw)
    if value != value or value < 0 or value > _MAX_HOURS:
        raise EffortSummaryError(f"'{key}' is out of range")
    return round(value, 2)


def submit(body: dict) -> IncidentEffortSummary:
    """Create or replace the summary for a Monday item, as 'pending'.
    `body` is the agent's JSON; raises EffortSummaryError on a bad one."""
    item_id = str(body.get("monday_item_id") or "").strip()
    if not item_id.isdigit():
        raise EffortSummaryError("'monday_item_id' must be a numeric Monday item id")

    total = _number(body, "total_hours", required=True)
    roles = {key: _number(body, key, required=False) for key in ROLE_FIELDS}

    count = body.get("volunteers_count")
    if isinstance(count, bool) or not isinstance(count, int) or count < 0 or count > _MAX_VOLUNTEERS:
        raise EffortSummaryError("'volunteers_count' must be a whole number")

    named = sum(roles.values())
    field_ops = _number(body, "field_operations_hours", required=False)
    other = _number(body, "other_hours", required=False)
    if named + field_ops + other > total + 0.01:
        # Roles add up to more than the total: the agent's numbers disagree with
        # themselves (and a derived "other" would silently be negative).
        raise EffortSummaryError("the role hours add up to more than 'total_hours'")

    row = IncidentEffortSummary.query.filter_by(monday_item_id=item_id).one_or_none()
    if row is None:
        row = IncidentEffortSummary(monday_item_id=item_id)
        db.session.add(row)

    row.total_hours = total
    for key, value in roles.items():
        setattr(row, key, value)
    row.field_operations_hours = field_ops
    # Sent explicitly when the agent knows it; absent: whatever the named roles and
    # field operations leave of the total.
    row.other_hours = other if body.get("other_hours") is not None else round(max(0.0, total - named - field_ops), 2)
    row.volunteers_count = count
    row.status = PENDING
    row.submitted_at = datetime.now(timezone.utc)
    row.reviewed_at = None
    row.reviewed_by_user_id = None
    # A fresh agent calculation: the numbers are the agent's again, whoever edited the last ones.
    row.source = FROM_AGENT
    row.edited_at = None
    row.edited_by_user_id = None
    _finish_request(item_id)
    return row


def review(row: IncidentEffortSummary, *, approve: bool, reviewer) -> IncidentEffortSummary:
    row.status = APPROVED if approve else REJECTED
    row.reviewed_at = datetime.now(timezone.utc)
    row.reviewed_by_user_id = reviewer.id
    return row


def get_for_item(monday_item_id: str) -> IncidentEffortSummary | None:
    return IncidentEffortSummary.query.filter_by(monday_item_id=str(monday_item_id)).one_or_none()


def get_approved_for_item(monday_item_id: str) -> IncidentEffortSummary | None:
    row = get_for_item(monday_item_id)
    return row if row is not None and row.status == APPROVED else None


def list_pending() -> list[IncidentEffortSummary]:
    return (
        IncidentEffortSummary.query.filter_by(status=PENDING)
        .order_by(IncidentEffortSummary.submitted_at.asc())
        .all()
    )


def serialize(row: IncidentEffortSummary, *, for_admin: bool = False) -> dict:
    data = {
        "id": row.id,
        "monday_item_id": row.monday_item_id,
        "status": row.status,
        "total_hours": row.total_hours,
        "supervisors_hours": row.supervisors_hours,
        "case_managers_hours": row.case_managers_hours,
        "command_center_hours": row.command_center_hours,
        "doctors_hours": row.doctors_hours,
        "mental_health_hours": row.mental_health_hours,
        "field_operations_hours": row.field_operations_hours,
        "other_hours": row.other_hours,
        "volunteers_count": row.volunteers_count,
        "submitted_at": row.submitted_at.isoformat() if row.submitted_at else None,
        "reviewed_at": row.reviewed_at.isoformat() if row.reviewed_at else None,
    }
    if for_admin:
        # Who touched the numbers is for admins only: a caller or family member sees the
        # figures, not the staff behind them.
        data["source"] = row.source
        data["edited_at"] = row.edited_at.isoformat() if row.edited_at else None
        editor = db.session.get(User, row.edited_by_user_id) if row.edited_by_user_id else None
        data["edited_by"] = (editor.full_name or editor.email) if editor else None
    return data


# -- "Summarize incident": the request, and the admin's manual edit -----------------

def _utc(value: datetime) -> datetime:
    # SQLite returns naive timestamps; they are UTC either way.
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def get_request(monday_item_id: str) -> EffortSummaryRequest | None:
    return EffortSummaryRequest.query.filter_by(monday_item_id=str(monday_item_id)).one_or_none()


def begin_request(monday_item_id: str, user) -> EffortSummaryRequest:
    """An admin clicked "Summarize incident": record it as in progress, replacing
    whatever the last click left. Does not commit."""
    row = get_request(monday_item_id)
    if row is None:
        row = EffortSummaryRequest(monday_item_id=str(monday_item_id))
        db.session.add(row)
    now = datetime.now(timezone.utc)
    row.state, row.reason = REQUESTED, None
    row.requested_at, row.updated_at = now, now
    row.requested_by_user_id = user.id
    return row


def fail_request(monday_item_id: str, reason: str) -> None:
    """The agent could not even be reached (or refused). Does not commit."""
    row = get_request(monday_item_id)
    if row is not None:
        row.state, row.reason, row.updated_at = FAILED, reason, datetime.now(timezone.utc)


def _finish_request(monday_item_id: str) -> None:
    row = get_request(monday_item_id)
    if row is not None:
        row.state, row.reason, row.updated_at = DONE, None, datetime.now(timezone.utc)


def report_status(body: dict) -> EffortSummaryRequest:
    """The agent says a request ended without numbers: it needs input from the WhatsApp
    group, or it failed. Only the item, the state and a reason CODE are accepted, never
    the agent's own words (they could name people). A report for an item nobody requested
    is refused: the status route can't create state out of nothing."""
    item_id = str(body.get("monday_item_id") or "").strip()
    if not item_id.isdigit():
        raise EffortSummaryError("'monday_item_id' must be a numeric Monday item id")
    state = body.get("state")
    if state not in _REPORTABLE_STATES:
        raise EffortSummaryError("'state' must be 'needs_input' or 'failed'")
    reason = body.get("reason")
    if reason not in _KNOWN_REASONS:
        reason = "needs_input" if state == NEEDS_INPUT else "agent_error"

    row = get_request(item_id)
    if row is None:
        raise EffortSummaryError("no request is waiting for this item", 404)
    row.state, row.reason, row.updated_at = state, reason, datetime.now(timezone.utc)
    return row


def serialize_request(row: EffortSummaryRequest | None) -> dict | None:
    if row is None or row.state == DONE:
        return None
    state, reason = row.state, row.reason
    if state == REQUESTED and datetime.now(timezone.utc) - _utc(row.requested_at) > REQUEST_STALE_AFTER:
        state, reason = FAILED, "timed_out"
    return {
        "state": state,
        "reason": reason,
        "requested_at": _utc(row.requested_at).isoformat(),
    }


def edit(row: IncidentEffortSummary, body: dict, editor) -> IncidentEffortSummary:
    """An admin typed over the numbers. The save IS their approval: the summary becomes
    (or stays) 'approved' with the new numbers, so a caller or family member sees them at
    once, whether it was pending before or already approved and posted. The total is the
    sum of the parts, so the breakdown can never disagree with it.
    Raises EffortSummaryError on a bad value; does not commit."""
    roles = {key: _number(body, key, required=False) for key in ROLE_FIELDS}
    field_ops = _number(body, "field_operations_hours", required=False)
    other = _number(body, "other_hours", required=False)
    count = body.get("volunteers_count")
    if isinstance(count, bool) or not isinstance(count, int) or count < 0 or count > _MAX_VOLUNTEERS:
        raise EffortSummaryError("'volunteers_count' must be a whole number")

    total = round(sum(roles.values()) + field_ops + other, 2)
    if total > _MAX_HOURS:
        raise EffortSummaryError("the hours add up to more than the allowed total")

    for key, value in roles.items():
        setattr(row, key, value)
    row.field_operations_hours = field_ops
    row.other_hours = other
    row.total_hours = total
    row.volunteers_count = count

    now = datetime.now(timezone.utc)
    row.status = APPROVED
    row.reviewed_at = now
    row.reviewed_by_user_id = editor.id
    row.source = FROM_ADMIN
    row.edited_at = now
    row.edited_by_user_id = editor.id
    return row


def monday_values(row: IncidentEffortSummary) -> dict:
    """The seven numbers that live on the Monday board, keyed like constants.EFFORT_COLUMNS."""
    return {
        "total_hours": row.total_hours,
        "supervisors_hours": row.supervisors_hours,
        "case_managers_hours": row.case_managers_hours,
        "command_center_hours": row.command_center_hours,
        "doctors_hours": row.doctors_hours,
        "mental_health_hours": row.mental_health_hours,
        "volunteers_count": row.volunteers_count,
    }

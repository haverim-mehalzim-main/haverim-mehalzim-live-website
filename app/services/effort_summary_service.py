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

from datetime import datetime, timezone

from app.extensions import db
from app.models import IncidentEffortSummary

PENDING, APPROVED, REJECTED = "pending", "approved", "rejected"

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


def serialize(row: IncidentEffortSummary) -> dict:
    return {
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

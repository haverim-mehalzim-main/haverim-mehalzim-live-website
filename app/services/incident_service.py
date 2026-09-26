"""
Local-DB side of the incident-ownership feature: which user opened which
Monday.com incident, and the per-incident task "journey" (things the user
needs to do vs. things Haverim Mehalzim is doing on their behalf).

Incident *details* (type, location, status, description, ...) are never
duplicated here — they stay on Monday.com, the system staff already work in.
This module only owns the ownership link and the task list, both of which
have no home on Monday at all.
"""

import secrets
from datetime import datetime, timezone

from app.extensions import db
from app.models import Incident, IncidentFollower, IncidentRejection, IncidentTask, IncidentTaskAssignee, IncidentTaskStatus, IncidentVolunteer
from app.services.account_service import grant_role


def create_incident_record(
    *,
    user_id: int,
    monday_item_id: str,
    submitted_location: str | None = None,
    submitted_patient_phone: str | None = None,
    submitted_description: str | None = None,
) -> Incident:
    """Record that `user_id` opened `monday_item_id`, and grant the 'client'
    role (idempotent, matches the donor/premium pattern — a role reflecting
    a real action taken). Does not commit."""
    incident = Incident(
        user_id=user_id,
        monday_item_id=str(monday_item_id),
        submitted_location=submitted_location,
        submitted_patient_phone=submitted_patient_phone,
        submitted_description=submitted_description,
    )
    db.session.add(incident)

    from app.models import User
    user = db.session.get(User, user_id)
    if user is not None:
        grant_role(user, "client")

    return incident


def list_incidents_for_user(user_id: int) -> list[Incident]:
    return Incident.query.filter_by(user_id=user_id).order_by(Incident.created_at.desc()).all()


def get_owned_incident(local_id: int, user_id: int) -> Incident | None:
    incident = db.session.get(Incident, local_id)
    if incident is None or incident.user_id != user_id:
        return None
    return incident


def get_or_create_share_token(incident: Incident) -> str:
    """Lazily mint the link a caller shares with family/friends. Generated
    once and kept forever — most incidents are never shared, so there's no
    reason to mint a token for every one at creation time. Does not commit."""
    if not incident.share_token:
        incident.share_token = secrets.token_urlsafe(18)
    return incident.share_token


def get_incident_by_share_token(token: str) -> Incident | None:
    if not token:
        return None
    return Incident.query.filter_by(share_token=token).one_or_none()


def join_incident(*, incident: Incident, user) -> IncidentFollower:
    """A logged-in family/friend joins an incident via its share link.
    Idempotent — joining twice just returns the existing row. Grants the
    'family' role (matches the donor/premium/client pattern: a role reflects
    a real action taken, not something anyone can just claim). The owner
    joining their own incident is a no-op at the route layer (see routes.py),
    not handled here. Does not commit."""
    existing = IncidentFollower.query.filter_by(incident_id=incident.id, user_id=user.id).one_or_none()
    if existing is not None:
        return existing

    follower = IncidentFollower(incident_id=incident.id, user_id=user.id)
    db.session.add(follower)
    grant_role(user, "family")
    return follower


def list_followed_incidents(user_id: int) -> list[Incident]:
    return (
        Incident.query.join(IncidentFollower, IncidentFollower.incident_id == Incident.id)
        .filter(IncidentFollower.user_id == user_id)
        .order_by(Incident.created_at.desc())
        .all()
    )


def list_tasks(incident_id: int) -> list[IncidentTask]:
    return IncidentTask.query.filter_by(incident_id=incident_id).order_by(IncidentTask.sort_order, IncidentTask.created_at).all()


def create_task(*, incident_id: int, assignee: str, title: str, description: str | None, sort_order: int = 0) -> IncidentTask:
    task = IncidentTask(
        incident_id=incident_id,
        assignee=IncidentTaskAssignee(assignee),
        title=title,
        description=description or None,
        sort_order=sort_order,
    )
    db.session.add(task)
    db.session.commit()
    return task


def update_task(task: IncidentTask, *, title: str | None = None, description: str | None = None,
                 status: str | None = None, sort_order: int | None = None) -> IncidentTask:
    if title is not None:
        task.title = title
    if description is not None:
        task.description = description
    if sort_order is not None:
        task.sort_order = sort_order
    if status is not None:
        new_status = IncidentTaskStatus(status)
        task.status = new_status
        task.completed_at = datetime.now(timezone.utc) if new_status == IncidentTaskStatus.DONE else None
    db.session.commit()
    return task


def delete_task(task: IncidentTask) -> None:
    db.session.delete(task)
    db.session.commit()


# ── Per-incident volunteer join requests ────────────────────────────────────
# Holding the global 'volunteer' role only grants a reduced preview of any
# incident's page — the fuller detail view and task-status actions require
# actually being approved to assist THIS incident, tracked here.

def get_volunteer_request(incident_id: int, user_id: int) -> IncidentVolunteer | None:
    return IncidentVolunteer.query.filter_by(incident_id=incident_id, user_id=user_id).one_or_none()


def is_approved_volunteer(incident_id: int, user_id: int) -> bool:
    req = get_volunteer_request(incident_id, user_id)
    return req is not None and req.approved_at is not None


def request_to_volunteer(*, incident: Incident, user) -> IncidentVolunteer:
    """A volunteer asks to actively assist this incident. Idempotent —
    re-requesting just returns the existing (pending or already-approved)
    row. Does not commit."""
    existing = get_volunteer_request(incident.id, user.id)
    if existing is not None:
        return existing
    request = IncidentVolunteer(incident_id=incident.id, user_id=user.id)
    db.session.add(request)
    return request


def approve_volunteer_request(request: IncidentVolunteer) -> None:
    request.approved_at = datetime.now(timezone.utc)


def list_pending_volunteer_requests(incident_id: int) -> list[IncidentVolunteer]:
    """Requests still awaiting a decision — excludes already-approved ones,
    so an approved volunteer doesn't keep reappearing in the admin's
    'Requesting to Join' list on every page reload."""
    return (
        IncidentVolunteer.query
        .filter_by(incident_id=incident_id, approved_at=None)
        .order_by(IncidentVolunteer.requested_at)
        .all()
    )


def count_pending_volunteer_requests(incident_ids: list[int]) -> dict[int, int]:
    """Pending (not yet approved) volunteer request count per incident, for
    the staff list view — so a case with someone waiting on approval doesn't
    go unnoticed just because nobody happened to open its page. One grouped
    query instead of one per incident."""
    if not incident_ids:
        return {}
    rows = (
        db.session.query(IncidentVolunteer.incident_id, db.func.count(IncidentVolunteer.id))
        .filter(IncidentVolunteer.incident_id.in_(incident_ids), IncidentVolunteer.approved_at.is_(None))
        .group_by(IncidentVolunteer.incident_id)
        .all()
    )
    return {incident_id: count for incident_id, count in rows}


def list_pending_volunteer_requests_by_incident() -> list[dict]:
    """The full volunteer-approval backlog for the management overview
    dashboard: one entry per incident with at least one pending request,
    oldest-waiting-request first, each carrying every individual volunteer
    still waiting on that case (name/email, not just a count) so the
    overview page can show who's waiting on what, not just how many. A
    single query, not one per incident."""
    rows = (
        IncidentVolunteer.query
        .filter(IncidentVolunteer.approved_at.is_(None))
        .order_by(IncidentVolunteer.requested_at)
        .all()
    )
    by_incident: dict[int, dict] = {}
    for req in rows:
        entry = by_incident.setdefault(req.incident_id, {
            'incident_id': req.incident_id,
            'oldest_requested_at': req.requested_at,
            'count': 0,
            'requesters': [],
        })
        entry['count'] += 1
        entry['requesters'].append({
            'request_id': req.id,
            'full_name': req.user.full_name if req.user else None,
            'email': req.user.email if req.user else None,
            'requested_at': req.requested_at,
        })
    return sorted(by_incident.values(), key=lambda e: e['oldest_requested_at'])


# ── New-request triage: reject reason (Monday has no column for it) ────────

def record_rejection(*, monday_item_id: str, reason: str, rejected_by_user_id: int | None) -> IncidentRejection:
    """Record (or replace, if this item was rejected before and is being
    rejected again) the reason an admin gave for declining a 'New Request by
    User' intake. Monday's own status/case-status columns are the source of
    truth for the decision itself (see the reject route) — this only holds
    the reason text, which has no column of its own on the board, so the
    caller's own incident page can show it. Does not commit."""
    existing = IncidentRejection.query.filter_by(monday_item_id=str(monday_item_id)).one_or_none()
    if existing is not None:
        existing.reason = reason
        existing.rejected_by_user_id = rejected_by_user_id
        existing.rejected_at = datetime.now(timezone.utc)
        return existing
    rejection = IncidentRejection(
        monday_item_id=str(monday_item_id), reason=reason, rejected_by_user_id=rejected_by_user_id,
    )
    db.session.add(rejection)
    return rejection


def get_rejection_reason(monday_item_id: str) -> str | None:
    row = IncidentRejection.query.filter_by(monday_item_id=str(monday_item_id)).one_or_none()
    return row.reason if row is not None else None

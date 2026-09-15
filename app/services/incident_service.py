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
from app.models import Incident, IncidentFollower, IncidentTask, IncidentTaskAssignee, IncidentTaskStatus
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


def get_accessible_incident(local_id: int, user_id: int) -> tuple[Incident | None, str | None]:
    """Returns (incident, relation) where relation is 'owner' or 'follower' —
    the caller (the actual person who opened it) or a family/friend who
    joined via a share link — or (None, None) if this user has no access to
    it at all. The relation tells the route how much detail to serialize."""
    incident = db.session.get(Incident, local_id)
    if incident is None:
        return None, None
    if incident.user_id == user_id:
        return incident, 'owner'
    is_follower = IncidentFollower.query.filter_by(incident_id=incident.id, user_id=user_id).first() is not None
    if is_follower:
        return incident, 'follower'
    return None, None


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

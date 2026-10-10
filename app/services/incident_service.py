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
from datetime import datetime, timedelta, timezone

from app.extensions import db
from app.models import Incident, IncidentCallerInvite, IncidentFollower, IncidentRejection, IncidentTask, IncidentTaskAssignee, IncidentTaskStatus, IncidentVolunteer, Payment, PaymentStatus
from app.services import volunteer_alert_service
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


# Tasks every caller gets the moment an admin approves their request, in this
# order. To add another default, append a dict here — nothing else to change.
DEFAULT_CASE_TASKS = [
    {
        'assignee': 'user',
        'title': 'Sign the Service Agreement',
        'description': (
            'Please fill in and sign our Service Agreement so we can start helping: '
            'https://forms.monday.com/forms/fe5bc533e9937d8b783501774fde2646?r=euc1'
        ),
    },
]


def add_default_tasks(incident: Incident) -> int:
    """Give an approved incident its default tasks. Safe to call twice: a task
    whose title is already on the incident is skipped, so an admin who deleted
    or edited one doesn't get a duplicate and a re-approval adds nothing.
    Adds to the session without committing; returns how many were added."""
    have = {t.title for t in IncidentTask.query.filter_by(incident_id=incident.id).all()}
    added = 0
    for order, spec in enumerate(DEFAULT_CASE_TASKS):
        if spec['title'] in have:
            continue
        db.session.add(IncidentTask(
            incident_id=incident.id,
            assignee=IncidentTaskAssignee(spec['assignee']),
            title=spec['title'],
            description=spec.get('description') or None,
            sort_order=order,
        ))
        added += 1
    return added


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


# ── Mirroring the whole Monday board locally ────────────────────────────────
# Every incident on Monday needs a local Incident row — otherwise a volunteer
# has no id to attach a join-request to, and "an incident on Monday that can't
# be approved through the app" (the thing this whole sync exists to prevent)
# stays possible. Most incidents are entered by staff straight on Monday, so
# this keeps the local table a mirror of the whole board, not just of
# incidents opened through the app.

_MIRRORED_COLUMNS = (
    ('submitted_location',      'location_mkmbv7be'),
    ('submitted_patient_phone', 'phone_mkz3dr0y'),
    ('submitted_description',   'long_text_mkpfvmh3'),
)


def mirror_monday_values(incident: Incident, monday_row: dict) -> bool:
    """Copy city / patient phone / description from Monday onto our own copy
    (Monday is the source of truth; the copy is only a fallback for when
    Monday has no value). Blank Monday values never overwrite a copy.
    Returns True if anything changed. Does not commit."""
    changed = False
    for attr, column_id in _MIRRORED_COLUMNS:
        value = (monday_row.get(column_id) or '').strip()
        if value and getattr(incident, attr) != value:
            setattr(incident, attr, value)
            changed = True
    return changed


def sync_local_incidents_from_monday(monday_rows: list[dict] | None) -> dict:
    """Create a shadow Incident row (user_id=None — no caller account, just a
    Monday item) for every row in monday_rows that doesn't have a local row
    yet, and refresh every existing row's copy of city / phone / description
    from Monday. Returns {'created': n, 'updated': m, 'alerted': k}. Does not commit.
    A failed Monday fetch (None) is a no-op, not an error."""
    rows_by_id = {str(row['id']): row for row in (monday_rows or []) if row.get('id')}
    stats = {'created': 0, 'updated': 0, 'alerted': 0}
    if not rows_by_id:
        return stats
    existing = {
        inc.monday_item_id: inc
        for inc in Incident.query.filter(Incident.monday_item_id.in_(list(rows_by_id))).all()
    }
    for monday_item_id, row in rows_by_id.items():
        incident = existing.get(monday_item_id)
        if incident is None:
            incident = Incident(user_id=None, monday_item_id=monday_item_id)
            db.session.add(incident)
            stats['created'] += 1
            mirror_monday_values(incident, row)
        elif mirror_monday_values(incident, row):
            stats['updated'] += 1
        # A case that is now "Working on it" is open to volunteers: alert them
        # once (see volunteer_alert_service). The emails go out after commit.
        if volunteer_alert_service.claim_if_newly_in_progress(incident, row):
            stats['alerted'] += 1
    return stats


# ── Volunteers' own participation history ───────────────────────────────────

def list_participated_incidents(user_id: int) -> list[Incident]:
    """Incidents this volunteer has been approved to actively assist — their
    own history, regardless of the incident's current status."""
    return (
        Incident.query
        .join(IncidentVolunteer, IncidentVolunteer.incident_id == Incident.id)
        .filter(IncidentVolunteer.user_id == user_id, IncidentVolunteer.approved_at.isnot(None))
        .order_by(IncidentVolunteer.approved_at.desc())
        .all()
    )


def count_approved_volunteer_incidents(user_id: int) -> int:
    return (
        IncidentVolunteer.query
        .filter(IncidentVolunteer.user_id == user_id, IncidentVolunteer.approved_at.isnot(None))
        .count()
    )


# ── Donors following the case they funded ───────────────────────────────────

def user_funded_incident(user_id: int, monday_item_id: str) -> bool:
    """True if this user has a confirmed donation earmarked for this Monday
    item — the donor thank-you email links them to follow that case, so a
    confirmed gift is the relationship that lets them see its progress."""
    return (
        Payment.query
        .filter(
            Payment.user_id == user_id,
            Payment.monday_item_id == str(monday_item_id),
            Payment.status == PaymentStatus.CONFIRMED,
        )
        .first()
    ) is not None


# ── Inviting the caller of a Monday-entered incident ───────────────────────
# Most incidents are typed straight into Monday by staff, so no app account
# owns them. An admin who knows the caller's email creates an invite; the
# caller opens the link, signs up with that exact email, and becomes the
# incident's owner (the same owner the app gives people who open a call
# themselves). The link is only a pointer — the claim itself is gated on a
# verified login for the invited email (see claim_caller_invite).

_CALLER_INVITE_TTL = timedelta(days=14)


class CallerInviteError(Exception):
    """Expected, user-facing failure. `status_code` maps to the HTTP response."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _aware(dt):
    return dt.replace(tzinfo=timezone.utc) if dt is not None and dt.tzinfo is None else dt


def caller_invite_state(invite: IncidentCallerInvite) -> str:
    """'claimed' | 'revoked' | 'expired' | 'pending'."""
    if invite.claimed_at is not None:
        return 'claimed'
    if invite.revoked_at is not None:
        return 'revoked'
    if _aware(invite.expires_at) < datetime.now(timezone.utc):
        return 'expired'
    return 'pending'


def get_latest_caller_invite(incident_id: int) -> IncidentCallerInvite | None:
    return (
        IncidentCallerInvite.query
        .filter_by(incident_id=incident_id)
        .order_by(IncidentCallerInvite.created_at.desc(), IncidentCallerInvite.id.desc())
        .first()
    )


def get_caller_invite_by_token(token: str) -> IncidentCallerInvite | None:
    if not token:
        return None
    return IncidentCallerInvite.query.filter_by(token=token).one_or_none()


def create_caller_invite(*, incident: Incident, email: str, name: str | None, created_by) -> IncidentCallerInvite:
    """Invite `email` to become the caller of `incident`. Any earlier unclaimed
    invite for this incident is revoked, so only the newest link works.
    `email` must already be validated/lowercased. Does not commit."""
    if incident.user_id is not None:
        raise CallerInviteError("This incident already has an account holder.", 409)

    now = datetime.now(timezone.utc)
    for old in IncidentCallerInvite.query.filter_by(incident_id=incident.id, claimed_at=None, revoked_at=None).all():
        old.revoked_at = now

    invite = IncidentCallerInvite(
        incident_id=incident.id,
        email=email,
        name=(name or '').strip()[:120] or None,
        token=secrets.token_urlsafe(32),
        created_by_user_id=created_by.id if created_by is not None else None,
        expires_at=now + _CALLER_INVITE_TTL,
    )
    db.session.add(invite)
    return invite


def revoke_caller_invite(invite: IncidentCallerInvite) -> None:
    if invite.claimed_at is None and invite.revoked_at is None:
        invite.revoked_at = datetime.now(timezone.utc)


def claim_caller_invite(*, invite: IncidentCallerInvite, user) -> Incident:
    """Make `user` the owner of the invited incident. Requires a logged-in
    (hence email-verified) user whose email is the invited one — the link
    alone proves nothing. Idempotent for the user who already claimed it.
    Does not commit."""
    incident = invite.incident
    if invite.claimed_at is not None:
        if invite.claimed_by_user_id == user.id:
            return incident
        raise CallerInviteError("This invitation has already been used.", 409)

    state = caller_invite_state(invite)
    if state == 'revoked':
        raise CallerInviteError("This invitation is no longer valid. Please ask Haverim Mehalzim for a new one.", 410)
    if state == 'expired':
        raise CallerInviteError("This invitation has expired. Please ask Haverim Mehalzim for a new one.", 410)

    if (user.email or '').strip().lower() != invite.email:
        raise CallerInviteError("This invitation was sent to a different email address.", 403)

    if incident.user_id is not None and incident.user_id != user.id:
        raise CallerInviteError("This incident already has an account holder.", 409)

    incident.user_id = user.id
    invite.claimed_at = datetime.now(timezone.utc)
    invite.claimed_by_user_id = user.id
    grant_role(user, "client")
    # Someone who was only following the case is now its owner.
    IncidentFollower.query.filter_by(incident_id=incident.id, user_id=user.id).delete()
    return incident

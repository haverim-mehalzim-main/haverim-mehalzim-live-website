import enum
from datetime import datetime, timezone

from app.extensions import db


class IncidentTaskAssignee(str, enum.Enum):
    USER = "user"
    STAFF = "staff"


class IncidentTaskStatus(str, enum.Enum):
    PENDING = "pending"
    DONE = "done"


class Incident(db.Model):
    """Ownership link between a logged-in user and a Monday.com incident item.

    Deliberately minimal: incident details (type, location, status, ...) stay
    on Monday.com — the single source of truth staff already work in. This
    table only answers "which user opened this, and which Monday item is it,"
    so "my incidents" can be looked up without duplicating/desyncing data
    that already lives there.
    """

    __tablename__ = "incidents"

    id = db.Column(db.BigInteger().with_variant(db.Integer, "sqlite"), primary_key=True)
    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    monday_item_id = db.Column(db.Text, nullable=False, unique=True)
    # Monday's location column requires real lat/lng (address alone is
    # rejected) — our minimal form only collects free text, no geocoding.
    # Stored here so "my incidents" can show what the requester actually
    # typed regardless of whether/when staff later plot it precisely on
    # Monday's own location picker.
    submitted_location = db.Column(db.Text, nullable=True)
    # Same reasoning as submitted_location: Monday's phone column requires a
    # validated number + ISO-2 country code, which our minimal form doesn't
    # collect. The patient's phone as typed is kept here for display; it's
    # also folded into the Monday item's description for staff to see.
    submitted_patient_phone = db.Column(db.Text, nullable=True)
    # The raw "what happened" text as the requester typed it, with none of
    # location/patient-phone folded in. Monday's own description column
    # (text_mm42945p) holds the folded, staff-facing version instead — and
    # is a plain "text" type that collapses newlines, so parsing our own
    # prefixes back out of it isn't reliable. Kept here so "my incidents" /
    # admin can show a clean description without duplicating the location
    # and patient-phone fields already shown elsewhere on the card.
    submitted_description = db.Column(db.Text, nullable=True)
    # Generated lazily (see incident_service.get_or_create_share_token) the
    # first time the owner asks to share this incident — most incidents are
    # never shared, so there's no reason to mint a token at creation time.
    share_token = db.Column(db.Text, nullable=True, unique=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), server_default=db.func.now())

    user = db.relationship("User", back_populates="incidents")
    tasks = db.relationship("IncidentTask", back_populates="incident", cascade="all, delete-orphan", order_by="IncidentTask.sort_order")
    followers = db.relationship("IncidentFollower", back_populates="incident", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Incident id={self.id} monday_item_id={self.monday_item_id!r}>"


class IncidentTask(db.Model):
    """One step in an incident's task 'journey' — either something the user
    needs to do, or something Haverim Mehalzim is doing on their behalf.
    Managed by staff (see the admin task endpoints); read-only for the user."""

    __tablename__ = "incident_tasks"

    id = db.Column(db.BigInteger().with_variant(db.Integer, "sqlite"), primary_key=True)
    incident_id = db.Column(db.BigInteger, db.ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False)
    assignee = db.Column(
        db.Enum(IncidentTaskAssignee, name="incident_task_assignee", native_enum=True, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    title = db.Column(db.Text, nullable=False)
    description = db.Column(db.Text, nullable=True)
    status = db.Column(
        db.Enum(IncidentTaskStatus, name="incident_task_status", native_enum=True, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=IncidentTaskStatus.PENDING,
        server_default=IncidentTaskStatus.PENDING.value,
    )
    sort_order = db.Column(db.SmallInteger, nullable=False, default=0, server_default="0")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), server_default=db.func.now())
    updated_at = db.Column(
        db.DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), server_default=db.func.now(),
    )
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)

    incident = db.relationship("Incident", back_populates="tasks")

    def __repr__(self):
        return f"<IncidentTask id={self.id} incident_id={self.incident_id} assignee={self.assignee} status={self.status}>"


class IncidentFollower(db.Model):
    """A logged-in user (family/friend) who joined an incident via the
    owner's share link. Read-only, macro-level access only — see
    incident_service for exactly what's hidden vs. shown vs. the owner.

    Deliberately lean: joining only ever happens for an already-authenticated
    user (see the join flow), so there's no "invited but hasn't signed up yet"
    state to track here — no email, no separate invite token, no relationship
    label. The share link itself lives on Incident.share_token.
    """

    __tablename__ = "incident_followers"
    __table_args__ = (
        db.UniqueConstraint("incident_id", "user_id", name="uq_incident_followers_incident_user"),
    )

    id = db.Column(db.BigInteger().with_variant(db.Integer, "sqlite"), primary_key=True)
    incident_id = db.Column(db.BigInteger, db.ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False)
    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    joined_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), server_default=db.func.now())

    incident = db.relationship("Incident", back_populates="followers")
    user = db.relationship("User", back_populates="followed_incidents")

    def __repr__(self):
        return f"<IncidentFollower incident_id={self.incident_id} user_id={self.user_id}>"

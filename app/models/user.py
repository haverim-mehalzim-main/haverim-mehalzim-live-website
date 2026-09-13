import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class UserStatus(str, enum.Enum):
    ACTIVE = "active"
    DISABLED = "disabled"


class User(db.Model):
    """Single identity anchor for every person who can log in or hold a role.

    A user is created eagerly (not on explicit sign-up) the first time someone
    donates or buys premium, matched/deduped by lowercased email — see
    DonorProfile / PremiumMembership. Roles (admin, donor, premium, ...) are
    additive via UserRole, never a fixed "type" here.
    """

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("email = lower(email)", name="ck_users_email_lowercase"),
    )

    # BigInteger for Postgres (BIGSERIAL); SQLite's rowid-autoincrement only
    # activates for a plain INTEGER PK, so swap the type there — this only
    # changes what SQLite tests run against, the already-applied Postgres
    # migration is untouched.
    id = db.Column(db.BigInteger().with_variant(db.Integer, "sqlite"), primary_key=True)
    # Public-facing identifier for URLs/tokens — never expose the sequential `id`.
    public_id = db.Column(UUID(as_uuid=True), nullable=False, unique=True, default=uuid.uuid4)
    email = db.Column(db.Text, nullable=False, unique=True)
    phone = db.Column(db.Text, nullable=True)
    # Nullable: accounts created implicitly at donation time have no password
    # until the person claims the account via the "set a password" email.
    password_hash = db.Column(db.Text, nullable=True)
    full_name = db.Column(db.Text, nullable=False)
    status = db.Column(
        db.Enum(UserStatus, name="user_status", native_enum=True, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=UserStatus.ACTIVE,
        server_default=UserStatus.ACTIVE.value,
    )
    email_verified_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), server_default=db.func.now())
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=db.func.now(),
    )
    last_login_at = db.Column(db.DateTime(timezone=True), nullable=True)

    role_links = db.relationship(
        "UserRole", foreign_keys="UserRole.user_id", back_populates="user", cascade="all, delete-orphan"
    )
    donor_profile = db.relationship("DonorProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    premium_membership = db.relationship("PremiumMembership", back_populates="user", uselist=False, cascade="all, delete-orphan")
    payments = db.relationship("Payment", back_populates="user")

    def __repr__(self):
        return f"<User id={self.id} email={self.email!r}>"

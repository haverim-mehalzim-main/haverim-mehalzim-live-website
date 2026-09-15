"""
Account service — identity helpers shared by every confirmed-payment flow
(donations, premium memberships, ...), plus the donation-specific mirroring
of a confirmed donation into the local Postgres identity tables.

Monday.com stays the source of truth for donor-facing data (the my-impact
token, leaderboard, cumulative amount shown to donors) for now — this module
does not replace that. It creates/updates the matching local User +
DonorProfile so a real account exists for future login/portal features,
per the implicit-account-creation decision: people are never asked to sign
up first, an account is created for them the moment a payment is confirmed,
matched/deduped by email.

Best-effort by design: callers should treat failures here as non-fatal (log,
don't raise) since the Monday.com write and the thank-you email are what
donors actually see today — a bug in this new, unproven path must never
block either of those.
"""

from datetime import date, datetime, timezone

from app.extensions import db
from app.models import DonorProfile, Role, User, UserRole
from app.services.money import to_decimal


def find_or_create_user(*, email: str, name: str, phone: str | None) -> User | None:
    """
    Find-or-create the identity anchor for a confirmed transaction, matched by
    lowercased email. Returns None if there is no usable email — identity is
    anchored on email (see User model), so nothing to key an account on.

    Shared by every confirmed-payment flow (donations, premium, ...) so
    "what does it mean to have an account here" stays defined in one place.
    Does not commit — the caller controls the transaction boundary.
    """
    email_norm = (email or "").strip().lower()
    if not email_norm:
        return None

    user = User.query.filter_by(email=email_norm).one_or_none()
    if user is None:
        user = User(email=email_norm, full_name=(name or email_norm).strip(), phone=phone or None)
        db.session.add(user)
        db.session.flush()  # assign user.id for FKs the caller adds next (DonorProfile, PremiumMembership, ...)
    elif phone and not user.phone:
        user.phone = phone
    return user


def grant_role(user: User, role_name: str) -> None:
    """
    Grant `role_name` to `user`, or re-activate it if it was previously
    revoked. Idempotent — safe to call on every confirmed payment, not just
    the first one. Does not commit.
    """
    role = Role.query.filter_by(name=role_name).one_or_none()
    if role is None:
        # Roles are seeded by migration, not created here — a missing role name
        # means the seed data is out of date, not something to paper over.
        raise LookupError(f"role {role_name!r} is not seeded in the roles table")

    link = db.session.get(UserRole, (user.id, role.id))
    if link is None:
        db.session.add(UserRole(user_id=user.id, role_id=role.id))
    elif link.revoked_at is not None:
        link.revoked_at = None
        link.granted_at = datetime.now(timezone.utc)


def user_has_role(user: User | None, *role_names: str) -> bool:
    """True if `user` currently holds any of `role_names` (revoked grants
    don't count). Shared permission check for role-gated routes — e.g. an
    endpoint open to both 'admin' and 'volunteer'."""
    if user is None:
        return False
    active = {link.role.name for link in user.role_links if link.revoked_at is None}
    return not active.isdisjoint(role_names)


def user_has_command_center_access(user: User | None) -> bool:
    """True for admins, or volunteers who also hold premium membership —
    the access shape for the elevated Command Center, distinct from the
    incident-ops staff console every admin/volunteer can already reach."""
    return user_has_role(user, "admin") or (user_has_role(user, "volunteer") and user_has_role(user, "premium"))


def ensure_donor_account(
    *,
    name: str,
    email: str,
    phone: str | None,
    amount_usd: float,
    impact_token: str | None,
    donation_date_iso: str,
) -> DonorProfile | None:
    """
    Find-or-create the User + DonorProfile for a confirmed donation and grant
    the "donor" role. Returns the updated DonorProfile, or None if there is no
    usable email.

    Does not commit — the caller controls the transaction boundary.
    """
    user = find_or_create_user(email=email, name=name, phone=phone)
    if user is None:
        return None

    donation_date: date = datetime.strptime(donation_date_iso[:10], "%Y-%m-%d").date()

    profile = user.donor_profile
    if profile is None:
        profile = DonorProfile(user_id=user.id, total_donated_usd=to_decimal(0))
        db.session.add(profile)

    profile.total_donated_usd = (profile.total_donated_usd or to_decimal(0)) + to_decimal(amount_usd)
    profile.first_donation_at = profile.first_donation_at or donation_date
    profile.last_donation_at = donation_date
    if impact_token and not profile.impact_token:
        profile.impact_token = impact_token

    grant_role(user, "donor")

    return profile

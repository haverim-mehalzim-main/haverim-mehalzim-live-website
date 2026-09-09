"""
Account service — mirrors a confirmed donation into the local Postgres
identity tables (users / roles / user_roles / donor_profiles).

Monday.com stays the source of truth for donor-facing data (the my-impact
token, leaderboard, cumulative amount shown to donors) for now — this module
does not replace that. It creates/updates the matching local User +
DonorProfile so a real account exists for future login/portal features,
per the implicit-account-creation decision: donors are never asked to sign
up, an account is created for them the moment a payment is confirmed,
matched/deduped by email.

Best-effort by design: callers should treat failures here as non-fatal (log,
don't raise) since the Monday.com write and the thank-you email are what
donors actually see today — a bug in this new, unproven path must never
block either of those.
"""

from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from app.extensions import db
from app.models import DonorProfile, Role, User, UserRole


def _to_decimal(amount: float) -> Decimal:
    return Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _grant_role(user: User, role_name: str) -> None:
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
    usable email — identity is anchored on email (see User model), so a
    donation with no email captured has nothing to key a local account on.

    Does not commit — the caller controls the transaction boundary.
    """
    email_norm = (email or "").strip().lower()
    if not email_norm:
        return None

    donation_date: date = datetime.strptime(donation_date_iso[:10], "%Y-%m-%d").date()

    user = User.query.filter_by(email=email_norm).one_or_none()
    if user is None:
        user = User(email=email_norm, full_name=(name or email_norm).strip(), phone=phone or None)
        db.session.add(user)
        db.session.flush()  # assign user.id for the DonorProfile FK below
    elif phone and not user.phone:
        user.phone = phone

    profile = user.donor_profile
    if profile is None:
        profile = DonorProfile(user_id=user.id, total_donated_usd=Decimal("0"))
        db.session.add(profile)

    profile.total_donated_usd = (profile.total_donated_usd or Decimal("0")) + _to_decimal(amount_usd)
    profile.first_donation_at = profile.first_donation_at or donation_date
    profile.last_donation_at = donation_date
    if impact_token and not profile.impact_token:
        profile.impact_token = impact_token

    _grant_role(user, "donor")

    return profile

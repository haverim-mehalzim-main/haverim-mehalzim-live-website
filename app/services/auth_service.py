"""
Auth service — "claim an existing account" signup, email verification, and
login. A User row may already exist, passwordless, from a prior donation or
premium purchase (see account_service.find_or_create_user); signing up here
either claims that row (sets a password on it) or creates a fresh one.

Security note: signup sets a password immediately, but LOGIN is refused until
the email is verified (email_verified_at is set) via a one-time link. Without
this, anyone who merely knows a donor's email address could "sign up" with
it and take over their account (see their donation history, premium status,
etc.) — the password alone proves nothing about who controls that inbox.
"""

import re
import secrets
from datetime import datetime, timedelta, timezone

from werkzeug.security import check_password_hash, generate_password_hash

from app.extensions import db
from app.models import User
from app.services.account_service import find_or_create_user

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_MIN_PASSWORD_LEN = 8
_VERIFICATION_TTL = timedelta(hours=24)


class AuthError(Exception):
    """Expected, user-facing auth failure. `status_code` maps directly to the HTTP response."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _validate_email(email: str) -> str:
    email = (email or "").strip().lower()
    if not email or not _EMAIL_RE.match(email):
        raise AuthError("A valid email address is required.", 400)
    return email


def _validate_password(password: str) -> str:
    # Length over complexity rules, per current password-hashing best practice
    # (NIST 800-63B) — arbitrary character-class requirements push people
    # toward predictable substitutions, not stronger passwords.
    if not password or len(password) < _MIN_PASSWORD_LEN:
        raise AuthError(f"Password must be at least {_MIN_PASSWORD_LEN} characters.", 400)
    return password


def request_signup(*, email: str, password: str, full_name: str, phone: str | None = None) -> tuple[User, str]:
    """
    Claim (or create) the account for `email`, setting a new password on it.
    Does NOT log the user in — they still need to click the verification link.

    Returns (user, verification_token). Commits.
    Raises AuthError if the account is already claimed and verified.
    """
    email = _validate_email(email)
    password = _validate_password(password)

    user = User.query.filter_by(email=email).one_or_none()
    if user is not None and user.password_hash is not None and user.email_verified_at is not None:
        raise AuthError("An account with this email already exists. Please log in instead.", 409)

    if user is None:
        full_name = (full_name or "").strip()
        if not full_name:
            raise AuthError("Full name is required.", 400)
        user = find_or_create_user(email=email, name=full_name, phone=phone)
    elif full_name and full_name.strip():
        user.full_name = full_name.strip()

    token = secrets.token_urlsafe(32)
    user.password_hash = generate_password_hash(password)
    user.email_verification_token = token
    user.email_verification_expires_at = datetime.now(timezone.utc) + _VERIFICATION_TTL

    db.session.commit()
    return user, token


def verify_email(token: str) -> User:
    """Activate the account for a valid, unexpired verification token."""
    token = (token or "").strip()
    if not token:
        raise AuthError("Invalid or expired verification link.", 400)

    user = User.query.filter_by(email_verification_token=token).one_or_none()
    if user is None:
        raise AuthError("Invalid or expired verification link.", 400)

    expires_at = user.email_verification_expires_at
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at is None or expires_at < datetime.now(timezone.utc):
        raise AuthError("This verification link has expired. Please sign up again.", 400)

    user.email_verified_at = datetime.now(timezone.utc)
    user.email_verification_token = None
    user.email_verification_expires_at = None
    db.session.commit()
    return user


def authenticate(*, email: str, password: str) -> User:
    """Verify credentials for login. Raises AuthError on any failure —
    deliberately the same generic message for 'no such user' and 'wrong
    password' so login can't be used to enumerate registered emails."""
    email = (email or "").strip().lower()
    user = User.query.filter_by(email=email).one_or_none()

    if user is None or user.password_hash is None or not check_password_hash(user.password_hash, password or ""):
        raise AuthError("Invalid email or password.", 401)

    if user.email_verified_at is None:
        raise AuthError("Please verify your email before logging in — check your inbox for the link.", 403)

    user.last_login_at = datetime.now(timezone.utc)
    db.session.commit()
    return user

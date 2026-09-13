import os
from dotenv import load_dotenv

load_dotenv()

BOARD_ID          = os.getenv("BOARD_ID")
MONDAY_URL        = "https://api.monday.com/v2"
API_KEY           = os.getenv("MONDAY_API_KEY")
FEEDBACK_BOARD_ID = os.getenv("FEEDBACK_BOARD_ID")
DONORS_BOARD_ID   = os.getenv("DONORS_BOARD_ID")
DONATIONS_BOARD_ID = os.getenv("DONATIONS_BOARD_ID")
NEWSLETTER_BOARD_ID = os.getenv("NEWSLETTER_BOARD_ID")
ADMIN_TOKEN       = os.getenv("ADMIN_TOKEN")

# Signs the login session cookie (see app/features/auth). MUST be a fixed
# value in production (set FLASK_SECRET_KEY on Railway) — falling back to a
# random one here means every restart/deploy invalidates every logged-in
# session. The random fallback exists only so local dev works without extra
# setup; it deliberately prints a loud warning so it's never mistaken for a
# real config in production.
import secrets as _secrets
SECRET_KEY = os.getenv("FLASK_SECRET_KEY")
if not SECRET_KEY:
    SECRET_KEY = _secrets.token_hex(32)
    print("[config] WARNING: FLASK_SECRET_KEY not set — using a random key for this "
          "process only. Set FLASK_SECRET_KEY in production or every restart logs everyone out.")

MONDAY_HEADERS = {
    "Authorization": API_KEY,
    "Content-Type": "application/json"
}

# ── Application database (Postgres, e.g. Railway's managed Postgres plugin) ──
# Railway injects DATABASE_URL automatically once the Postgres plugin is added
# and linked to this service. It arrives as "postgresql://..." (sometimes the
# legacy "postgres://" scheme) — SQLAlchemy needs the driver named explicitly,
# so we rewrite the scheme to force the psycopg (v3) driver regardless of which
# variant is supplied.
_RAW_DATABASE_URL = os.getenv("DATABASE_URL", "")


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


SQLALCHEMY_DATABASE_URI = _normalize_database_url(_RAW_DATABASE_URL)

# ── Tranzila payment gateway ─────────────────────────────────────────────────
# Regular (non-token) terminal — we only take one-time charges, so no need for
# the tokens terminal. Credentials live in .env (never hardcode).
TRANZILLA_TERMINAL          = os.getenv("TRANZILLA_TERMINAL")
TRANZILLA_TERMINAL_PASSWORD = os.getenv("TRANZILLA_TERMINAL_PASSWORD")
TRANZILLA_API_USERNAME      = os.getenv("TRANZILLA_API_USERNAME")
TRANZILLA_API_PUBLIC_KEY    = os.getenv("TRANZILLA_API_PUBLIC_KEY")
TRANZILLA_API_PRIVATE_KEY   = os.getenv("TRANZILLA_API_PRIVATE_KEY")
# 1 = ILS (shekel), 2 = USD. Donors now choose their currency per donation; this
# is only the fallback when none is supplied.
TRANZILLA_CURRENCY          = os.getenv("TRANZILLA_CURRENCY", "1")
# NOTE: the USD→ILS rate and the impact-link threshold are hardcoded business
# constants in app/features/incidents/constants.py (USD_TO_ILS, IMPACT_LINK_MIN_USD),
# deliberately NOT env-driven so a bad/missing env var can't break a donation.
# Hosted-page host. "directng.tranzila.com" is Tranzila's current standard
# (the older "direct.tranzila.com" is deprecated). Override via env if needed.
TRANZILLA_HOST              = os.getenv("TRANZILLA_HOST", "directng.tranzila.com")
# Optional shared secret configured in the Tranzila terminal's "notify" settings.
# When set, incoming server notifications are rejected unless they carry it.
TRANZILLA_NOTIFY_SECRET     = os.getenv("TRANZILLA_NOTIFY_SECRET")

# Absolute base URL of THIS app, e.g. https://your-app.onrender.com — Tranzila
# needs fully-qualified success / fail / notify URLs to redirect and call back.
PUBLIC_BASE_URL = (os.getenv("PUBLIC_BASE_URL") or "").rstrip("/")

# ── Brevo transactional email ────────────────────────────────────────────────
# Used to send the donor thank-you email after a confirmed donation. Only the
# API key is a secret (set it in .env locally and in the Render dashboard). The
# sender identity is baked in as a default so Render needs just BREVO_API_KEY —
# the from-address must be a verified sender / authenticated domain in Brevo.
BREVO_API_KEY        = os.getenv("BREVO_API_KEY")
EMAIL_SENDER_NAME    = os.getenv("EMAIL_SENDER_NAME",    "Haverim Mehalzim")
EMAIL_SENDER_ADDRESS = os.getenv("EMAIL_SENDER_ADDRESS", "info@haverimmehalzim.org")
# Where donor replies land. Defaults to the sender address.
EMAIL_REPLY_TO       = os.getenv("EMAIL_REPLY_TO", "") or EMAIL_SENDER_ADDRESS

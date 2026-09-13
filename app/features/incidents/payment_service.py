"""
Tranzila payment service — builds the hosted-page (iframe/redirect) URL for a
one-time donation and validates the server-to-server notify callback.

Design: STATELESS. We never store a "pending order" locally. Every fact we need
to reconcile a payment (order id, incident, package, donor) is passed to Tranzila
as a custom URL parameter; Tranzila echoes those exact params back to both the
browser success URL and the server notify URL. On a confirmed notify we write the
donation to Monday.com. This survives Render restarts with no database.

Tranzila hosted-page parameters we use:
  sum                 — charge amount
  currency            — 1 = ILS, 2 = USD
  cred_type           — 1 = regular (single) charge
  contact/email/phone — donor contact, shown on the receipt
  pdesc               — product description (appears on the page + receipt)
  success_url_address — browser redirect after approval
  fail_url_address    — browser redirect after failure/cancel
  notify_url_address  — server-to-server POST/GET we treat as source of truth
  <custom>            — any extra key we add is stored and echoed back verbatim

Response fields Tranzila returns (on notify + success redirect):
  Response            — "000" means approved
  ConfirmationCode    — issuer confirmation / approval number
  index               — Tranzila's internal transaction id
  sum                 — the amount actually charged (authoritative)
"""

import secrets
from urllib.parse import urlencode

from app.config import (
    TRANZILLA_TERMINAL,
    TRANZILLA_CURRENCY,
    TRANZILLA_NOTIFY_SECRET,
    TRANZILLA_HOST,
    PUBLIC_BASE_URL,
)
from app.features.incidents.constants import USD_TO_ILS

_APPROVED = "000"

# Donor-selectable currencies → Tranzila numeric currency code. USD=2, ILS=1.
CURRENCY_CODES = {"USD": "2", "ILS": "1"}
SUPPORTED_CURRENCIES = list(CURRENCY_CODES.keys())


def currency_code(name: str) -> str:
    """Map a currency name ('USD'/'ILS') to its Tranzila code; fall back to config."""
    return CURRENCY_CODES.get((name or "").strip().upper(), TRANZILLA_CURRENCY)


def to_usd(amount, code: str) -> float:
    """
    Convert a charged amount in Tranzila-code `code` to USD using the fixed rate.
    Used to value a gift against the USD-denominated impact-link threshold.
    """
    try:
        amount = float(amount)
    except (ValueError, TypeError):
        return 0.0
    if str(code) == CURRENCY_CODES["ILS"]:
        return amount / USD_TO_ILS if USD_TO_ILS else amount
    # USD (or unknown) — treat as already USD.
    return amount

# Our custom param names (echoed back by Tranzila). Prefixed to avoid colliding
# with any reserved Tranzila field.
P_ORDER    = "u_order_id"
P_INCIDENT = "u_incident_id"
P_PACKAGE  = "u_package_id"
P_PKGLABEL = "u_package_label"
P_SECRET   = "u_secret"
# What this checkout is for — "donation" (default, existing behaviour
# unchanged) or "premium_membership". Absent on any checkout built before this
# param existed, which parse_notify below defaults to "donation" too, so an
# in-flight donation checkout from before a deploy is unaffected.
P_PURPOSE  = "u_purpose"


def new_order_id() -> str:
    """Unguessable id that ties a browser session to its notify callback."""
    return secrets.token_urlsafe(18)


def is_configured() -> bool:
    return bool(TRANZILLA_TERMINAL and PUBLIC_BASE_URL)


def build_payment_url(order: dict) -> str | None:
    """
    Build the Tranzila hosted-page URL for one donation.

    `order` keys:
      order_id, amount, currency (Tranzila code), incident_id, package_id,
      package_label, donor_name, donor_email, donor_phone
    """
    if not is_configured():
        print("[payment_service] TRANZILLA_TERMINAL or PUBLIC_BASE_URL not set")
        return None

    base = f"https://{TRANZILLA_HOST}/{TRANZILLA_TERMINAL}/iframenew.php"

    # "donation" label doesn't fit a premium purchase — a premium buyer should
    # never see "donation" on the payment page they're about to pay on.
    pdesc = "פרימיום - חברים מחלצים" if order.get("purpose") == "premium_membership" else "תרומה - חברים מחלצים"
    if order.get("package_label"):
        pdesc = f"{pdesc} · {order['package_label']}"

    params = {
        "sum":                 f"{float(order['amount']):.2f}",
        "currency":            order.get("currency") or TRANZILLA_CURRENCY,
        "cred_type":           "1",
        "pdesc":               pdesc,
        "contact":             order.get("donor_name", ""),
        "email":               order.get("donor_email", ""),
        "phone":               order.get("donor_phone", ""),
        "success_url_address": f"{PUBLIC_BASE_URL}/donate/thanks",
        "fail_url_address":    f"{PUBLIC_BASE_URL}/donate/failed",
        "notify_url_address":  f"{PUBLIC_BASE_URL}/api/tranzilla/notify",
        # custom, echoed back to us verbatim on success + notify
        P_ORDER:    order["order_id"],
        P_INCIDENT: order.get("incident_id", ""),
        P_PACKAGE:  order.get("package_id", ""),
        P_PKGLABEL: order.get("package_label", ""),
        P_PURPOSE:  order.get("purpose", "donation"),
    }
    if TRANZILLA_NOTIFY_SECRET:
        params[P_SECRET] = TRANZILLA_NOTIFY_SECRET

    # Drop empties so we don't send blank contact fields.
    params = {k: v for k, v in params.items() if v not in (None, "")}
    return f"{base}?{urlencode(params)}"


def parse_notify(values: dict) -> dict | None:
    """
    Validate an incoming Tranzila notify (query args or form fields → dict) and
    normalise it into the fields we persist. Returns None if the payment was not
    approved or the shared secret (when configured) does not match.
    """
    # Reject spoofed callbacks when a notify secret is configured on the terminal.
    if TRANZILLA_NOTIFY_SECRET:
        if values.get(P_SECRET) != TRANZILLA_NOTIFY_SECRET:
            print("[payment_service] notify rejected: bad/missing shared secret")
            return None

    if values.get("Response") != _APPROVED:
        print(f"[payment_service] notify not approved: Response={values.get('Response')}")
        return None

    order_id = values.get(P_ORDER)
    if not order_id:
        print("[payment_service] notify rejected: missing order id")
        return None

    try:
        amount = float(values.get("sum") or 0)
    except (ValueError, TypeError):
        amount = 0.0

    return {
        "order_id":         order_id,
        "purpose":          values.get(P_PURPOSE) or "donation",
        "incident_id":      values.get(P_INCIDENT) or "",
        "package_id":       values.get(P_PACKAGE) or "",
        "package_label":    values.get(P_PKGLABEL) or "",
        "amount":           amount,
        "currency":         values.get("currency") or TRANZILLA_CURRENCY,
        "confirmation_code": values.get("ConfirmationCode") or "",
        "transaction_id":   values.get("index") or values.get("TransactionID") or "",
        "donor_name":       values.get("contact") or "",
        "donor_email":      values.get("email") or "",
        "donor_phone":      values.get("phone") or "",
    }

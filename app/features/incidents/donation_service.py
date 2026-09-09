"""
Donation service — persists a CONFIRMED Tranzila payment to Monday.com.

Two writes happen per confirmed donation:
  1. Find-or-create the donor on the Donors board (matched by email), so the
     donation ties into the existing my-impact / leaderboard token system.
  2. Create a row on the Donations board with amount, date, package, incident,
     and a board-relation link to that donor.

Every column id is read from the environment so the board layout can change
without touching code. Fill these in .env:

  DONATIONS_BOARD_ID          — (already used) the donations board
  DONATION_AMOUNT_COL=numbers            — numeric column
  DONATION_DATE_COL=date4                — date column
  DONATION_DONOR_COL=board_relation_mksevkdt   — connect-boards → Donors board
  DONATION_INCIDENT_COL=<id>             — connect-boards → incidents board (main)
  DONATION_INCIDENT_COL_TYPE=board_relation  — board_relation (default) | text
  DONATION_ORDER_COL=<id>                — (optional) text col: order + confirmation
  DONATION_STATUS_COL=<id>               — (optional) status col to mark "Paid"
  DONATION_PAID_LABEL=שולם               — (optional) label to set on DONATION_STATUS_COL

  DONORS_BOARD_ID             — (already used) the donors board
  DONOR_EMAIL_COL=<id>        — text col used to match an existing donor by email
  DONOR_TOKEN_COL=text_mm37g124          — permanent personal token (my-impact link)
  DONOR_AMOUNT_COL=numeric_mm37pefa      — cumulative amount (kept in sync)
"""

import os
import json as _json
import secrets
import requests

from app.config import (
    MONDAY_URL, MONDAY_HEADERS,
    DONATIONS_BOARD_ID, DONORS_BOARD_ID,
)
from app.extensions import db
from app.features.incidents.constants import IMPACT_LINK_MIN_USD
from app.features.incidents.payment_service import to_usd
from app.services.account_service import ensure_donor_account

# ── Donations board columns ──────────────────────────────────────────────────
# Defaults are baked in (not just left to env) because production runs on Render,
# which does NOT read the local .env — only vars set in its dashboard. Baking the
# known ids here means the columns fill in without depending on Render env vars.
_AMOUNT_COL   = os.getenv("DONATION_AMOUNT_COL",   "numbers")
_DATE_COL     = os.getenv("DONATION_DATE_COL",     "date4")
_DONOR_COL    = os.getenv("DONATION_DONOR_COL",    "board_relation_mksevkdt")
# Incident is linked via a board-relation column → the main incidents board
# (item_ids = the incident's Monday item id).
_INCIDENT_COL = os.getenv("DONATION_INCIDENT_COL", "board_relation_mm5ck4nc")
_INCIDENT_TYPE = os.getenv("DONATION_INCIDENT_COL_TYPE", "board_relation")
_ORDER_COL    = os.getenv("DONATION_ORDER_COL",    "text_mm5crtkb")
_STATUS_COL   = os.getenv("DONATION_STATUS_COL",   "")
_PAID_LABEL   = os.getenv("DONATION_PAID_LABEL",   "שולם")

# ── Donors board columns ─────────────────────────────────────────────────────
_DONOR_EMAIL_COL  = os.getenv("DONOR_EMAIL_COL",  "email_mm5cnfxk")
_DONOR_TOKEN_COL  = os.getenv("DONOR_TOKEN_COL",  "text_mm37g124")
_DONOR_AMOUNT_COL = os.getenv("DONOR_AMOUNT_COL", "numeric_mm37pefa")
# Connect-boards column on the Donors board that links a donor to their donation
# items on the Donations board. Each new donation is appended here.
_DONOR_DONATIONS_COL = os.getenv("DONOR_DONATIONS_COL", "connect_boards3")


def _escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _post(query: str) -> dict | None:
    try:
        resp = requests.post(MONDAY_URL, json={"query": query}, headers=MONDAY_HEADERS, timeout=15)
        data = resp.json()
        if "errors" in data:
            print(f"[donation_service] Monday error: {data['errors']}")
            return None
        return data
    except Exception as e:
        print(f"[donation_service] Request failed: {e}")
        return None


def _parse_amount(raw: str) -> float:
    import re
    cleaned = re.sub(r"[^\d.]", "", (raw or "").strip())
    try:
        return float(cleaned) if cleaned else 0.0
    except (ValueError, TypeError):
        return 0.0


# ── Donor find-or-create ─────────────────────────────────────────────────────

def find_or_create_donor(name: str, email: str, phone: str, amount: float,
                         amount_usd: float | None = None) -> tuple[str | None, str | None]:
    """
    Return (donor_item_id, token) for the donor, creating the row if this email
    is new. On an existing donor, bumps their cumulative amount so my-impact
    stays correct.

    The personal impact token is a TOP-TIER PERK: it is only generated for a gift
    worth IMPACT_LINK_MIN_USD or more. Donors may pay in any currency, so the
    caller passes `amount_usd` (the gift converted to USD) for the threshold test;
    when omitted it defaults to `amount` (assumes already USD). A donor who never
    crosses the bar has no token, so no /my-impact link appears in their email. A
    donor who already earned a token keeps it and still gets the link on smaller
    follow-up gifts.

    Returns (None, None) if the Donors board is not configured (the donation is
    still recorded, just without a donor link).
    """
    if not DONORS_BOARD_ID:
        return None, None

    # The Donors board cumulative is kept in USD so my-impact / leaderboard are
    # single-currency regardless of what the donor paid in. Normalise here.
    usd = amount if amount_usd is None else amount_usd
    qualifies = round(usd) >= IMPACT_LINK_MIN_USD

    existing_id, existing_amount, existing_token = _lookup_donor(email, name)
    if existing_id:
        _bump_donor_amount(existing_id, existing_amount + usd)
        # Keep an existing token; only mint one now if this gift qualifies.
        token = existing_token or (_ensure_donor_token(existing_id) if qualifies else None)
        return existing_id, token

    return _create_donor(name, email, usd, qualifies)


def _lookup_donor(email: str, name: str) -> tuple[str | None, float, str | None]:
    ids = [c for c in [_DONOR_EMAIL_COL, _DONOR_AMOUNT_COL, _DONOR_TOKEN_COL] if c]
    ids_gql = ", ".join(f'"{c}"' for c in ids) if ids else '""'

    data = _post(f"""
      {{
        boards(ids: [{DONORS_BOARD_ID}]) {{
          items_page(limit: 500) {{
            items {{
              id
              name
              column_values(ids: [{ids_gql}]) {{ id text }}
            }}
          }}
        }}
      }}
    """)
    if not data:
        return None, 0.0, None

    items = data["data"]["boards"][0]["items_page"]["items"]
    email_norm = (email or "").strip().lower()
    name_norm  = (name or "").strip().lower()

    for item in items:
        cols = {cv["id"]: cv["text"] for cv in item["column_values"]}
        row_amount = _parse_amount(cols.get(_DONOR_AMOUNT_COL) or "")
        row_token  = (cols.get(_DONOR_TOKEN_COL) or "").strip() or None
        # Prefer matching on email; fall back to exact name when no email column.
        if _DONOR_EMAIL_COL and email_norm:
            if (cols.get(_DONOR_EMAIL_COL) or "").strip().lower() == email_norm:
                return item["id"], row_amount, row_token
        elif name_norm and (item["name"] or "").strip().lower() == name_norm:
            return item["id"], row_amount, row_token

    return None, 0.0, None


def _ensure_donor_token(item_id: str) -> str | None:
    """Write a fresh permanent token onto a donor row that is missing one."""
    if not _DONOR_TOKEN_COL:
        return None
    token = secrets.token_hex(16)
    values = _escape(_json.dumps({_DONOR_TOKEN_COL: token}))
    data = _post(f"""
      mutation {{
        change_multiple_column_values(
          board_id: {DONORS_BOARD_ID},
          item_id: {item_id},
          column_values: "{values}"
        ) {{ id }}
      }}
    """)
    return token if data else None


def _create_donor(name: str, email: str, usd_amount: float, qualifies: bool) -> tuple[str | None, str | None]:
    # Impact token only for qualifying (top-tier) gifts — see find_or_create_donor.
    token = secrets.token_hex(16) if (_DONOR_TOKEN_COL and qualifies) else None
    values: dict = {_DONOR_AMOUNT_COL: f"{usd_amount:.2f}"}  # stored in USD
    if _DONOR_EMAIL_COL and email:
        # Monday email columns expect a structured {"email","text"} value.
        values[_DONOR_EMAIL_COL] = {"email": email, "text": email}
    if token:
        values[_DONOR_TOKEN_COL] = token

    col_values = _escape(_json.dumps(values))
    item_name = _escape(name or email or "תורם/ת")

    data = _post(f"""
      mutation {{
        create_item(
          board_id: {DONORS_BOARD_ID},
          item_name: "{item_name}",
          column_values: "{col_values}",
          create_labels_if_missing: true
        ) {{ id }}
      }}
    """)
    if not data:
        return None, None
    return data["data"]["create_item"]["id"], token


def _bump_donor_amount(item_id: str, new_total: float) -> None:
    if not _DONOR_AMOUNT_COL:
        return
    values = _escape(_json.dumps({_DONOR_AMOUNT_COL: f"{new_total:.2f}"}))  # USD, 2dp
    _post(f"""
      mutation {{
        change_multiple_column_values(
          board_id: {DONORS_BOARD_ID},
          item_id: {item_id},
          column_values: "{values}"
        ) {{ id }}
      }}
    """)


def _existing_linked_ids(donor_id: str) -> list[int]:
    """Read the donation ids already linked on the donor's references column."""
    data = _post(f"""
      {{
        items(ids: [{donor_id}]) {{
          column_values(ids: ["{_DONOR_DONATIONS_COL}"]) {{ id value }}
        }}
      }}
    """)
    try:
        raw = data["data"]["items"][0]["column_values"][0]["value"] if data else None
    except (KeyError, IndexError, TypeError):
        raw = None
    if not raw:
        return []
    try:
        linked = (_json.loads(raw) or {}).get("linkedPulseIds", [])
        return [int(x["linkedPulseId"]) for x in linked if x.get("linkedPulseId")]
    except (ValueError, TypeError, KeyError):
        return []


def link_donation_to_donor(donor_id: str, donation_id: str) -> None:
    """
    Append this donation to the donor's connect-boards references column, keeping
    any donations already linked (a plain write would replace them).
    """
    if not (_DONOR_DONATIONS_COL and donor_id and donation_id):
        return

    ids = _existing_linked_ids(donor_id)
    if int(donation_id) in ids:
        return  # idempotent — already linked
    ids.append(int(donation_id))

    values = _escape(_json.dumps({_DONOR_DONATIONS_COL: {"item_ids": ids}}))
    _post(f"""
      mutation {{
        change_multiple_column_values(
          board_id: {DONORS_BOARD_ID},
          item_id: {donor_id},
          column_values: "{values}"
        ) {{ id }}
      }}
    """)
    print(f"[donation_service] linked donation {donation_id} to donor {donor_id}")


# ── Donation row ─────────────────────────────────────────────────────────────

def _column_value(col_type: str, raw: str):
    """Format a scalar into Monday's expected column-value shape by column type."""
    if col_type == "board_relation":
        if raw and str(raw).isdigit():
            return {"item_ids": [int(raw)]}
        return None
    if col_type == "status":
        return {"label": raw} if raw else None
    # text / default
    return raw or None


def record_donation(payment: dict, date_iso: str, donor_item_id: str | None) -> str | None:
    """
    Create the donation row on the Donations board from a confirmed `payment`
    (as returned by payment_service.parse_notify). Returns the new item id.
    """
    if not DONATIONS_BOARD_ID:
        print("[donation_service] DONATIONS_BOARD_ID not set")
        return None

    values: dict = {
        _AMOUNT_COL: f"{payment['amount']:.2f}",
        _DATE_COL:   {"date": date_iso[:10]},
    }

    if donor_item_id and _DONOR_COL:
        values[_DONOR_COL] = {"item_ids": [int(donor_item_id)]}

    if _INCIDENT_COL:
        # Link the donation to the incident on the main board. `incident_id` is
        # the incident's Monday item id, so board_relation links it directly.
        v = _column_value(_INCIDENT_TYPE, payment.get("incident_id", ""))
        if v is not None:
            values[_INCIDENT_COL] = v

    if _ORDER_COL:
        # Human-reconcilable audit trail: our order id + Tranzila's confirmation.
        values[_ORDER_COL] = (
            f"{payment['order_id']} · conf {payment.get('confirmation_code', '')}"
            f" · tx {payment.get('transaction_id', '')}"
        )

    if _STATUS_COL and _PAID_LABEL:
        values[_STATUS_COL] = {"label": _PAID_LABEL}

    col_values = _escape(_json.dumps(values))
    item_name = _escape(payment.get("donor_name") or payment.get("donor_email") or "תרומה")

    data = _post(f"""
      mutation {{
        create_item(
          board_id: {DONATIONS_BOARD_ID},
          item_name: "{item_name}",
          column_values: "{col_values}",
          create_labels_if_missing: true
        ) {{ id }}
      }}
    """)
    if not data:
        return None

    item_id = data["data"]["create_item"]["id"]
    print(f"[donation_service] Recorded donation item {item_id} (order {payment['order_id']})")
    return item_id


def _find_donation_id_by_order(order_id: str) -> str | None:
    """
    Return the id of an already-recorded donation for this order, or None.

    Dedup key is the order id we stored on `_ORDER_COL` (format
    "<order_id> · conf … · tx …"). Tranzila may fire the notify callback more
    than once for the same charge; without this, each retry would create a
    duplicate donation row and resend the thank-you email. Stateless by design:
    the source of truth is Monday, not a local store. Requires `_ORDER_COL`;
    if it is not configured we cannot dedup and return None (no dedup).

    Note: this is a read-before-write check, not a lock — two truly simultaneous
    callbacks could still both pass. In practice Tranzila retries are spaced out,
    so this removes the duplicates seen in real usage.
    """
    if not (DONATIONS_BOARD_ID and _ORDER_COL and order_id):
        return None

    # Newest-first so recent orders (the ones being retried) stay within limit.
    data = _post(f"""
      {{
        boards(ids: [{DONATIONS_BOARD_ID}]) {{
          items_page(
            limit: 500,
            query_params: {{ order_by: [{{ column_id: "__creation_log__", direction: desc }}] }}
          ) {{
            items {{
              id
              column_values(ids: ["{_ORDER_COL}"]) {{ id text }}
            }}
          }}
        }}
      }}
    """)
    if not data:
        return None
    try:
        items = data["data"]["boards"][0]["items_page"]["items"]
    except (KeyError, IndexError, TypeError):
        return None

    for item in items:
        for cv in item["column_values"]:
            text = (cv.get("text") or "").strip()
            if text and text.split(" · ", 1)[0].strip() == order_id:
                return item["id"]
    return None


def record_confirmed_payment(payment: dict, date_iso: str) -> dict:
    """
    High-level entry point: link/create donor, write the donation row, then
    add that donation to the donor's references-to-donations column.

    Returns a dict {donor_id, donation_id, token, duplicate} so the caller can
    send the thank-you email (which needs the donor's permanent my-impact token).
    `duplicate` is True when this order was already recorded by an earlier notify
    — the caller should then skip the email. Any id/token may be None if the
    corresponding write/lookup did not happen.
    """
    # Idempotency: if a prior (possibly retried) notify already recorded this
    # order, do nothing — no new row, no second email.
    order_id = payment.get("order_id", "")
    existing_id = _find_donation_id_by_order(order_id)
    if existing_id:
        print(f"[donation_service] duplicate notify for order {order_id} — "
              f"donation {existing_id} already recorded, skipping")
        return {"donor_id": None, "donation_id": existing_id, "token": None, "duplicate": True}

    amount_usd = to_usd(payment["amount"], payment.get("currency", ""))

    donor_id, token = find_or_create_donor(
        payment.get("donor_name", ""),
        payment.get("donor_email", ""),
        payment.get("donor_phone", ""),
        payment["amount"],
        amount_usd=amount_usd,
    )
    donation_id = record_donation(payment, date_iso, donor_id)
    if donor_id and donation_id:
        link_donation_to_donor(donor_id, donation_id)

    # Mirror into the local Postgres identity tables (implicit account
    # creation). Best-effort: Monday.com above is still what donors actually
    # see today, so a bug in this newer path must not break their donation.
    try:
        ensure_donor_account(
            name=payment.get("donor_name", ""),
            email=payment.get("donor_email", ""),
            phone=payment.get("donor_phone", ""),
            amount_usd=amount_usd,
            impact_token=token,
            donation_date_iso=date_iso,
        )
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"[donation_service] local account sync failed (non-fatal): {e}")

    return {"donor_id": donor_id, "donation_id": donation_id, "token": token, "duplicate": False}

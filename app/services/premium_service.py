"""
Premium membership service — the Tranzila checkout for the premium product
(separate from donations, its own fixed price, its own order flow) and, once
confirmed, mirrors the purchase into `payments` (transaction audit) and
`premium_memberships` (permanent status), reusing the same
find-or-create-User identity logic as donations.

Unlike the donation flow, checkouts here are NOT stateless: a `payments` row
is written the moment a checkout starts (see create_pending_payment), so an
abandoned/declined checkout is still visible afterward as a row stuck in
'pending' — rather than leaving no trace at all, as an incomplete donation
checkout does today.
"""

from datetime import datetime, timezone

from app.extensions import db
from app.features.incidents.payment_service import to_usd
from app.models import Payment, PaymentPurpose, PaymentStatus, PremiumMembership
from app.services.account_service import find_or_create_user, grant_role
from app.services.money import to_decimal


def create_pending_payment(
    *,
    order_id: str,
    donor_name: str,
    donor_email: str,
    donor_phone: str,
    amount: float,
    currency: str,
    amount_usd: float,
    plan: str,
) -> Payment:
    """Record a premium checkout the moment it starts, before Tranzila is even
    reached. Commits immediately — this is a standalone write, not composed
    with anything else."""
    payment = Payment(
        order_id=order_id,
        purpose=PaymentPurpose.PREMIUM_MEMBERSHIP,
        status=PaymentStatus.PENDING,
        donor_name=donor_name or None,
        donor_email=(donor_email or "").strip().lower() or None,
        donor_phone=donor_phone or None,
        amount=to_decimal(amount),
        currency=currency,
        amount_usd=to_decimal(amount_usd),
        plan=plan or None,
    )
    db.session.add(payment)
    db.session.commit()
    return payment


def record_confirmed_premium_purchase(payment: dict, date_iso: str) -> dict:
    """
    High-level entry point, mirroring donation_service.record_confirmed_payment's
    shape, called from /api/tranzilla/notify when payment['purpose'] ==
    'premium_membership'.

    Returns {"user_id", "duplicate"}. Does not commit — the caller controls
    the transaction boundary (same contract as ensure_donor_account).
    """
    order_id = payment.get("order_id", "")
    existing = Payment.query.filter_by(order_id=order_id).one_or_none()

    if existing is not None and existing.status == PaymentStatus.CONFIRMED:
        print(f"[premium_service] duplicate notify for order {order_id} — already confirmed, skipping")
        return {"user_id": existing.user_id, "duplicate": True}

    if existing is None:
        # Defensive: a notify arrived for an order /api/premium/start never
        # recorded (shouldn't normally happen). Record it now rather than
        # silently dropping confirmed money.
        existing = Payment(order_id=order_id, purpose=PaymentPurpose.PREMIUM_MEMBERSHIP)
        db.session.add(existing)

    # Tranzila's returned sum/currency are authoritative — overwrite whatever
    # was guessed at checkout-start time.
    amount_usd = to_usd(payment["amount"], payment.get("currency", ""))
    existing.amount = to_decimal(payment["amount"])
    existing.currency = payment.get("currency", "")
    existing.amount_usd = to_decimal(amount_usd)
    existing.plan = payment.get("package_id") or existing.plan
    existing.status = PaymentStatus.CONFIRMED
    existing.confirmation_code = payment.get("confirmation_code", "")
    existing.transaction_id = payment.get("transaction_id", "")
    existing.confirmed_at = datetime.now(timezone.utc)
    existing.raw_notify_payload = payment

    user = find_or_create_user(
        email=payment.get("donor_email", ""),
        name=payment.get("donor_name", ""),
        phone=payment.get("donor_phone", ""),
    )
    if user is None:
        # No email captured at checkout — nothing to key an account on. The
        # payment itself is still recorded above so the money isn't lost to
        # audit even though no membership/account can be created for it.
        print(f"[premium_service] order {order_id} confirmed with no donor email — "
              f"payment recorded, no account/membership created")
        return {"user_id": None, "duplicate": False}

    existing.user_id = user.id

    membership = user.premium_membership
    if membership is None:
        membership = PremiumMembership(
            user_id=user.id,
            plan=existing.plan or "standard",
            amount_paid=existing.amount,
            currency=existing.currency,
            amount_paid_usd=existing.amount_usd,
            purchased_at=datetime.strptime(date_iso[:10], "%Y-%m-%d").date(),
        )
        db.session.add(membership)
    # else: already premium (e.g. a repeat purchase) — the payment above is
    # still recorded for audit; multiple plans/upgrades aren't designed yet.

    grant_role(user, "premium")

    return {"user_id": user.id, "duplicate": False}

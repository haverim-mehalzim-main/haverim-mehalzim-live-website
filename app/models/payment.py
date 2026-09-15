import enum
from datetime import datetime, timezone

from sqlalchemy.dialects.postgresql import JSONB

from app.extensions import db


class PaymentPurpose(str, enum.Enum):
    DONATION = "donation"
    PREMIUM_MEMBERSHIP = "premium_membership"


class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    FAILED = "failed"


class Payment(db.Model):
    """Real order/transaction audit trail for a Tranzila checkout.

    Both the premium-membership and donation flows write here (see
    app/services/premium_service.py and donation_service.py).
    """

    __tablename__ = "payments"

    id = db.Column(db.BigInteger().with_variant(db.Integer, "sqlite"), primary_key=True)
    order_id = db.Column(db.Text, nullable=False, unique=True)
    purpose = db.Column(
        db.Enum(PaymentPurpose, name="payment_purpose", native_enum=True, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    status = db.Column(
        db.Enum(PaymentStatus, name="payment_status", native_enum=True, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=PaymentStatus.PENDING,
        server_default=PaymentStatus.PENDING.value,
    )
    donor_name = db.Column(db.Text, nullable=True)
    donor_email = db.Column(db.Text, nullable=True)
    donor_phone = db.Column(db.Text, nullable=True)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    currency = db.Column(db.Text, nullable=False)
    amount_usd = db.Column(db.Numeric(12, 2), nullable=False)
    plan = db.Column(db.Text, nullable=True)
    # For a donation: the Monday.com item id it was earmarked for (Tranzila's
    # own "incident_id" custom param — misleadingly named, it's a Monday item
    # id, not our local Incident.id). Not a FK: most donated-to incidents are
    # staff-managed directly on Monday and never exist in our local table.
    monday_item_id = db.Column(db.Text, nullable=True)
    confirmation_code = db.Column(db.Text, nullable=True)
    transaction_id = db.Column(db.Text, nullable=True)
    raw_notify_payload = db.Column(JSONB().with_variant(db.JSON, "sqlite"), nullable=True)
    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), server_default=db.func.now())
    confirmed_at = db.Column(db.DateTime(timezone=True), nullable=True)

    user = db.relationship("User", back_populates="payments")

    def __repr__(self):
        return f"<Payment order_id={self.order_id!r} purpose={self.purpose} status={self.status}>"

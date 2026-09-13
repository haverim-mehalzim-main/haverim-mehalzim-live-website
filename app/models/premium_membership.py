from datetime import datetime, timezone

from app.extensions import db


class PremiumMembership(db.Model):
    """Permanent premium status (1:1 with User).

    Granted once on a confirmed premium purchase and never expires or
    auto-lapses — premium is a one-time payment, not a subscription, so there
    is deliberately no expiry/renewal field here.
    """

    __tablename__ = "premium_memberships"

    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    plan = db.Column(db.Text, nullable=False, server_default="standard")
    amount_paid = db.Column(db.Numeric(12, 2), nullable=False)
    currency = db.Column(db.Text, nullable=False)
    amount_paid_usd = db.Column(db.Numeric(12, 2), nullable=False)
    purchased_at = db.Column(db.Date, nullable=False)
    note = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), server_default=db.func.now())
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=db.func.now(),
    )

    user = db.relationship("User", back_populates="premium_membership")

    def __repr__(self):
        return f"<PremiumMembership user_id={self.user_id} plan={self.plan!r}>"

from datetime import datetime, timezone

from app.extensions import db


class DonorProfile(db.Model):
    """Donor-specific extension of a User (1:1). Always backed by a user row —

    accounts are created implicitly at donation time (matched/deduped by
    lowercased email), never requiring sign-up before checkout.
    """

    __tablename__ = "donor_profiles"

    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    total_donated_usd = db.Column(db.Numeric(12, 2), nullable=False, server_default="0")
    # Minted only once a donor's qualifying gift crosses IMPACT_LINK_MIN_USD.
    impact_token = db.Column(db.Text, nullable=True, unique=True)
    first_donation_at = db.Column(db.Date, nullable=True)
    last_donation_at = db.Column(db.Date, nullable=True)
    note = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), server_default=db.func.now())
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=db.func.now(),
    )

    user = db.relationship("User", back_populates="donor_profile")

    def __repr__(self):
        return f"<DonorProfile user_id={self.user_id} total_donated_usd={self.total_donated_usd}>"

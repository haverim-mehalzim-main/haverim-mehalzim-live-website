from datetime import datetime, timezone

from app.extensions import db


class IntakeOfficer(db.Model):
    """An on-call officer allowed to talk to the incident agent on WhatsApp (and
    so to open an intake). Managed by admins from the staff console; the full
    active list is pushed to the agent whenever it changes (see
    intake_officer_service.sync).

    The name is required and travels with the number: the agent greets the
    officer by it and records it as the officer on the report and on Monday, so
    "who took this call" never depends on what is typed in the middle of one.

    Removing an officer sets `removed_at` instead of deleting the row, so there
    is a record of who had access and who granted and revoked it; adding the same
    number again reactivates the row.
    """

    __tablename__ = "intake_officers"

    id = db.Column(db.BigInteger().with_variant(db.Integer, "sqlite"), primary_key=True)
    # E.164 with a leading "+"; unique, so the same person can't be listed twice
    phone = db.Column(db.Text, nullable=False, unique=True)
    full_name = db.Column(db.Text, nullable=False)
    added_by_user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), server_default=db.func.now())
    removed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    removed_by_user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    added_by = db.relationship("User", foreign_keys=[added_by_user_id])

    def __repr__(self):
        return f"<IntakeOfficer id={self.id} active={self.removed_at is None}>"

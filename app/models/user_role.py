from app.extensions import db


class UserRole(db.Model):
    """Which roles a user currently/previously held, with a grant audit trail.

    One row per (user, role) pair for the lifetime of that pairing: re-granting
    a previously revoked role clears revoked_at rather than inserting a new row.
    A separate append-only audit log can be added later if a full history of
    every grant/revoke event (not just the current state) is ever needed.
    """

    __tablename__ = "user_roles"

    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_id = db.Column(db.SmallInteger, db.ForeignKey("roles.id", ondelete="RESTRICT"), primary_key=True)
    granted_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=db.func.now())
    # Who granted this role; null means system-granted (e.g. auto-granted "donor"
    # role on first confirmed donation, not by an admin action).
    granted_by = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    revoked_at = db.Column(db.DateTime(timezone=True), nullable=True)

    user = db.relationship("User", foreign_keys=[user_id], back_populates="role_links")
    role = db.relationship("Role")
    granter = db.relationship("User", foreign_keys=[granted_by])

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None

    def __repr__(self):
        return f"<UserRole user_id={self.user_id} role_id={self.role_id} active={self.is_active}>"

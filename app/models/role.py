from app.extensions import db


class Role(db.Model):
    """Static lookup of access roles. Seeded by migration, not created at runtime."""

    __tablename__ = "roles"

    id = db.Column(db.SmallInteger, primary_key=True)
    name = db.Column(db.Text, nullable=False, unique=True)
    description = db.Column(db.Text, nullable=True)

    def __repr__(self):
        return f"<Role {self.name!r}>"

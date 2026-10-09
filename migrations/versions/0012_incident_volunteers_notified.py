"""add incidents.volunteers_notified_at

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-10

"""
from alembic import op
import sqlalchemy as sa

revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('incidents', sa.Column('volunteers_notified_at', sa.DateTime(timezone=True), nullable=True))
    # Every case that exists today counts as already announced. Without this,
    # the first sync after deploy would email every volunteer about every
    # old "Working on it" case on the board.
    op.execute("UPDATE incidents SET volunteers_notified_at = now()")


def downgrade():
    op.drop_column('incidents', 'volunteers_notified_at')

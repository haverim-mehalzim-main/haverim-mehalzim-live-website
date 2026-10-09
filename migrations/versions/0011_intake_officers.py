"""add intake_officers table (who may talk to the incident agent on WhatsApp)

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-10

"""
from alembic import op
import sqlalchemy as sa

revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'intake_officers',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('phone', sa.Text(), nullable=False),
        sa.Column('full_name', sa.Text(), nullable=False),
        sa.Column('added_by_user_id', sa.BigInteger(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('removed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('removed_by_user_id', sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(['added_by_user_id'], ['users.id'], name='fk_intake_officers_added_by', ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['removed_by_user_id'], ['users.id'], name='fk_intake_officers_removed_by', ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name='pk_intake_officers'),
        sa.UniqueConstraint('phone', name='uq_intake_officers_phone'),
    )


def downgrade():
    op.drop_table('intake_officers')

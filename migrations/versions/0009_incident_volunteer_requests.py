"""add incident_volunteers table (per-incident volunteer join requests)

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-15

"""
from alembic import op
import sqlalchemy as sa

revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'incident_volunteers',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('incident_id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('requested_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['incident_id'], ['incidents.id'], name='fk_incident_volunteers_incident_id', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_incident_volunteers_user_id', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_incident_volunteers'),
        sa.UniqueConstraint('incident_id', 'user_id', name='uq_incident_volunteers_incident_user'),
    )
    op.create_index('ix_incident_volunteers_user_id', 'incident_volunteers', ['user_id'])


def downgrade():
    op.drop_index('ix_incident_volunteers_user_id', table_name='incident_volunteers')
    op.drop_table('incident_volunteers')

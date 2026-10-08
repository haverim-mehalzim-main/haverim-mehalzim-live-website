"""add incident_caller_invites table (admin invites the caller of a Monday-entered incident)

Revision ID: 0010
Revises: 63eceed780d5
Create Date: 2026-10-09

"""
from alembic import op
import sqlalchemy as sa

revision = '0010'
down_revision = '63eceed780d5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'incident_caller_invites',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('incident_id', sa.BigInteger(), nullable=False),
        sa.Column('email', sa.Text(), nullable=False),
        sa.Column('name', sa.Text(), nullable=True),
        sa.Column('token', sa.Text(), nullable=False),
        sa.Column('created_by_user_id', sa.BigInteger(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('claimed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('claimed_by_user_id', sa.BigInteger(), nullable=True),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['incident_id'], ['incidents.id'], name='fk_incident_caller_invites_incident_id', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], name='fk_incident_caller_invites_created_by', ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['claimed_by_user_id'], ['users.id'], name='fk_incident_caller_invites_claimed_by', ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name='pk_incident_caller_invites'),
        sa.UniqueConstraint('token', name='uq_incident_caller_invites_token'),
    )
    op.create_index('ix_incident_caller_invites_incident_id', 'incident_caller_invites', ['incident_id'])


def downgrade():
    op.drop_index('ix_incident_caller_invites_incident_id', table_name='incident_caller_invites')
    op.drop_table('incident_caller_invites')

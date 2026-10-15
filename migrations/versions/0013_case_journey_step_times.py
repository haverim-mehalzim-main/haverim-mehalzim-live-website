"""case journey step times: incidents.case_step_seen / step1_due_at, case_step_events

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-15

"""
from alembic import op
import sqlalchemy as sa

revision = '0013'
down_revision = '0012'
branch_labels = None
depends_on = None


def upgrade():
    # Both new incident columns stay NULL for every existing case on purpose:
    # no step history is invented, and nothing old is scheduled to auto-advance.
    op.add_column('incidents', sa.Column('case_step_seen', sa.Integer(), nullable=True))
    op.add_column('incidents', sa.Column('step1_due_at', sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        'case_step_events',
        sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), primary_key=True),
        sa.Column('incident_id', sa.BigInteger(), sa.ForeignKey('incidents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('step', sa.Integer(), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('source', sa.Text(), nullable=False),
        sa.UniqueConstraint('incident_id', 'step', name='uq_case_step_events_incident_step'),
    )
    op.create_index('ix_case_step_events_incident_id', 'case_step_events', ['incident_id'])


def downgrade():
    op.drop_index('ix_case_step_events_incident_id', table_name='case_step_events')
    op.drop_table('case_step_events')
    op.drop_column('incidents', 'step1_due_at')
    op.drop_column('incidents', 'case_step_seen')

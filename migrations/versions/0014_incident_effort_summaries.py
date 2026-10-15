"""incident_effort_summaries: the agent's effort estimate per incident, pending admin approval

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-15

"""
from alembic import op
import sqlalchemy as sa

revision = '0014'
down_revision = '0013'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'incident_effort_summaries',
        sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), primary_key=True),
        sa.Column('monday_item_id', sa.Text(), nullable=False, unique=True),
        sa.Column('status', sa.Text(), nullable=False, server_default='pending'),
        sa.Column('total_hours', sa.Float(), nullable=False),
        sa.Column('supervisors_hours', sa.Float(), nullable=False, server_default='0'),
        sa.Column('case_managers_hours', sa.Float(), nullable=False, server_default='0'),
        sa.Column('command_center_hours', sa.Float(), nullable=False, server_default='0'),
        sa.Column('doctors_hours', sa.Float(), nullable=False, server_default='0'),
        sa.Column('mental_health_hours', sa.Float(), nullable=False, server_default='0'),
        sa.Column('field_operations_hours', sa.Float(), nullable=False, server_default='0'),
        sa.Column('other_hours', sa.Float(), nullable=False, server_default='0'),
        sa.Column('volunteers_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reviewed_by_user_id', sa.BigInteger(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
    )
    op.create_index('ix_incident_effort_summaries_status', 'incident_effort_summaries', ['status'])


def downgrade():
    op.drop_index('ix_incident_effort_summaries_status', table_name='incident_effort_summaries')
    op.drop_table('incident_effort_summaries')

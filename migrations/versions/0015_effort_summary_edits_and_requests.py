"""effort summary: admin edits (source / edited_at / edited_by) and the request-status table

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-16

"""
from alembic import op
import sqlalchemy as sa

revision = '0015'
down_revision = '0014'
branch_labels = None
depends_on = None


def upgrade():
    # Additive and defaulted, so the version still serving during the deploy keeps working.
    op.add_column('incident_effort_summaries', sa.Column('source', sa.Text(), nullable=False, server_default='agent'))
    op.add_column('incident_effort_summaries', sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('incident_effort_summaries', sa.Column('edited_by_user_id', sa.BigInteger(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True))
    op.create_table(
        'effort_summary_requests',
        sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), primary_key=True),
        sa.Column('monday_item_id', sa.Text(), nullable=False, unique=True),
        sa.Column('state', sa.Text(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('requested_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('requested_by_user_id', sa.BigInteger(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('effort_summary_requests')
    op.drop_column('incident_effort_summaries', 'edited_by_user_id')
    op.drop_column('incident_effort_summaries', 'edited_at')
    op.drop_column('incident_effort_summaries', 'source')

"""add volunteer/family roles, incident sharing, payments.monday_item_id

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-15

"""
from alembic import op
import sqlalchemy as sa

revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('incidents', sa.Column('share_token', sa.Text(), nullable=True))
    op.create_index('ix_incidents_share_token', 'incidents', ['share_token'], unique=True)

    op.create_table(
        'incident_followers',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('incident_id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['incident_id'], ['incidents.id'], name='fk_incident_followers_incident_id', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_incident_followers_user_id', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_incident_followers'),
        sa.UniqueConstraint('incident_id', 'user_id', name='uq_incident_followers_incident_user'),
    )
    op.create_index('ix_incident_followers_user_id', 'incident_followers', ['user_id'])

    # Which Monday.com incident a donation was earmarked for. Not a FK to our
    # local `incidents` table — most donations target incidents staff manage
    # directly on Monday that were never opened through the account dashboard,
    # so this mirrors Incident.monday_item_id's own "text, not FK" approach.
    op.add_column('payments', sa.Column('monday_item_id', sa.Text(), nullable=True))
    op.create_index('ix_payments_monday_item_id', 'payments', ['monday_item_id'])

    op.bulk_insert(
        sa.table(
            'roles',
            sa.column('id', sa.SmallInteger),
            sa.column('name', sa.Text),
            sa.column('description', sa.Text),
        ),
        [
            {'id': 5, 'name': 'volunteer', 'description': 'Staff member who can view and work incidents'},
            {'id': 6, 'name': 'family', 'description': 'Joined at least one incident via a caller\'s share link'},
        ],
    )


def downgrade():
    op.execute("DELETE FROM roles WHERE id IN (5, 6)")
    op.drop_index('ix_payments_monday_item_id', table_name='payments')
    op.drop_column('payments', 'monday_item_id')
    op.drop_index('ix_incident_followers_user_id', table_name='incident_followers')
    op.drop_table('incident_followers')
    op.drop_index('ix_incidents_share_token', table_name='incidents')
    op.drop_column('incidents', 'share_token')

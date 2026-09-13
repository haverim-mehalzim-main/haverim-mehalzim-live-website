"""add client role, incidents, incident_tasks

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-14

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None

assignee_enum = postgresql.ENUM('user', 'staff', name='incident_task_assignee')
task_status_enum = postgresql.ENUM('pending', 'done', name='incident_task_status')


def upgrade():
    bind = op.get_bind()
    assignee_enum.create(bind, checkfirst=True)
    task_status_enum.create(bind, checkfirst=True)

    op.create_table(
        'incidents',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.BigInteger(), nullable=True),
        sa.Column('monday_item_id', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_incidents_user_id', ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name='pk_incidents'),
    )
    op.create_index('ix_incidents_monday_item_id', 'incidents', ['monday_item_id'], unique=True)
    op.create_index('ix_incidents_user_id', 'incidents', ['user_id'])

    op.create_table(
        'incident_tasks',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('incident_id', sa.BigInteger(), nullable=False),
        sa.Column(
            'assignee',
            postgresql.ENUM('user', 'staff', name='incident_task_assignee', create_type=False),
            nullable=False,
        ),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column(
            'status',
            postgresql.ENUM('pending', 'done', name='incident_task_status', create_type=False),
            server_default='pending',
            nullable=False,
        ),
        sa.Column('sort_order', sa.SmallInteger(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['incident_id'], ['incidents.id'], name='fk_incident_tasks_incident_id', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_incident_tasks'),
    )
    op.create_index('ix_incident_tasks_incident_id', 'incident_tasks', ['incident_id'])

    op.bulk_insert(
        sa.table(
            'roles',
            sa.column('id', sa.SmallInteger),
            sa.column('name', sa.Text),
            sa.column('description', sa.Text),
        ),
        [
            {'id': 4, 'name': 'client', 'description': 'Has opened at least one incident through the account dashboard'},
        ],
    )


def downgrade():
    op.drop_index('ix_incident_tasks_incident_id', table_name='incident_tasks')
    op.drop_table('incident_tasks')
    op.drop_index('ix_incidents_user_id', table_name='incidents')
    op.drop_index('ix_incidents_monday_item_id', table_name='incidents')
    op.drop_table('incidents')
    op.execute("DELETE FROM roles WHERE id = 4")

    bind = op.get_bind()
    task_status_enum.drop(bind, checkfirst=True)
    assignee_enum.drop(bind, checkfirst=True)

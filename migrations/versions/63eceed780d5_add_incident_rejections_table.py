"""add incident rejections table

Revision ID: 63eceed780d5
Revises: 0009
Create Date: 2026-09-26 11:34:28.569072

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '63eceed780d5'
down_revision = '0009'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('incident_rejections',
    sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False),
    sa.Column('monday_item_id', sa.Text(), nullable=False),
    sa.Column('reason', sa.Text(), nullable=False),
    sa.Column('rejected_by_user_id', sa.BigInteger(), nullable=True),
    sa.Column('rejected_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['rejected_by_user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('monday_item_id')
    )


def downgrade():
    op.drop_table('incident_rejections')

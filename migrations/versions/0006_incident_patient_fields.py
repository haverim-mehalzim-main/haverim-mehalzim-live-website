"""add incidents.submitted_patient_phone

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-16

"""
from alembic import op
import sqlalchemy as sa

revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('incidents', sa.Column('submitted_patient_phone', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('incidents', 'submitted_patient_phone')

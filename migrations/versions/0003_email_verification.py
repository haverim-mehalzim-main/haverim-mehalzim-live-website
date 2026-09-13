"""add email verification fields to users

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-13

"""
from alembic import op
import sqlalchemy as sa

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('email_verification_token', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('email_verification_expires_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_users_email_verification_token', 'users', ['email_verification_token'], unique=True)


def downgrade():
    op.drop_index('ix_users_email_verification_token', table_name='users')
    op.drop_column('users', 'email_verification_expires_at')
    op.drop_column('users', 'email_verification_token')

"""create users, roles, user_roles, donor_profiles

Revision ID: 0001
Revises:
Create Date: 2026-09-09

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0001'
down_revision = None
branch_labels = None
depends_on = None

user_status_enum = postgresql.ENUM('active', 'disabled', name='user_status')


def upgrade():
    bind = op.get_bind()
    user_status_enum.create(bind, checkfirst=True)

    op.create_table(
        'users',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('public_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('email', sa.Text(), nullable=False),
        sa.Column('phone', sa.Text(), nullable=True),
        sa.Column('password_hash', sa.Text(), nullable=True),
        sa.Column('full_name', sa.Text(), nullable=False),
        sa.Column(
            'status',
            postgresql.ENUM('active', 'disabled', name='user_status', create_type=False),
            server_default='active',
            nullable=False,
        ),
        sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_users'),
        sa.CheckConstraint('email = lower(email)', name='ck_users_email_lowercase'),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_index('ix_users_public_id', 'users', ['public_id'], unique=True)

    op.create_table(
        'roles',
        sa.Column('id', sa.SmallInteger(), autoincrement=True, nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_roles'),
    )
    op.create_index('ix_roles_name', 'roles', ['name'], unique=True)

    op.create_table(
        'user_roles',
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('role_id', sa.SmallInteger(), nullable=False),
        sa.Column('granted_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('granted_by', sa.BigInteger(), nullable=True),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_user_roles_user_id', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id'], name='fk_user_roles_role_id', ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['granted_by'], ['users.id'], name='fk_user_roles_granted_by', ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('user_id', 'role_id', name='pk_user_roles'),
    )

    op.create_table(
        'donor_profiles',
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('total_donated_usd', sa.Numeric(12, 2), server_default='0', nullable=False),
        sa.Column('impact_token', sa.Text(), nullable=True),
        sa.Column('first_donation_at', sa.Date(), nullable=True),
        sa.Column('last_donation_at', sa.Date(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_donor_profiles_user_id', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', name='pk_donor_profiles'),
    )
    op.create_index('ix_donor_profiles_impact_token', 'donor_profiles', ['impact_token'], unique=True)

    # Seed the roles the app needs today. Add more rows via a future migration
    # as new features require them — never create roles at runtime from app code.
    op.bulk_insert(
        sa.table(
            'roles',
            sa.column('id', sa.SmallInteger),
            sa.column('name', sa.Text),
            sa.column('description', sa.Text),
        ),
        [
            {'id': 1, 'name': 'admin', 'description': 'Full administrative access'},
            {'id': 2, 'name': 'donor', 'description': 'Has made at least one confirmed donation'},
        ],
    )


def downgrade():
    op.drop_table('donor_profiles')
    op.drop_table('user_roles')
    op.drop_index('ix_roles_name', table_name='roles')
    op.drop_table('roles')
    op.drop_index('ix_users_public_id', table_name='users')
    op.drop_index('ix_users_email', table_name='users')
    op.drop_table('users')

    bind = op.get_bind()
    user_status_enum.drop(bind, checkfirst=True)

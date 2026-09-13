"""add premium role, payments, premium_memberships

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-13

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None

payment_purpose_enum = postgresql.ENUM('donation', 'premium_membership', name='payment_purpose')
payment_status_enum = postgresql.ENUM('pending', 'confirmed', 'failed', name='payment_status')


def upgrade():
    bind = op.get_bind()
    payment_purpose_enum.create(bind, checkfirst=True)
    payment_status_enum.create(bind, checkfirst=True)

    op.create_table(
        'payments',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('order_id', sa.Text(), nullable=False),
        sa.Column(
            'purpose',
            postgresql.ENUM('donation', 'premium_membership', name='payment_purpose', create_type=False),
            nullable=False,
        ),
        sa.Column(
            'status',
            postgresql.ENUM('pending', 'confirmed', 'failed', name='payment_status', create_type=False),
            server_default='pending',
            nullable=False,
        ),
        sa.Column('donor_name', sa.Text(), nullable=True),
        sa.Column('donor_email', sa.Text(), nullable=True),
        sa.Column('donor_phone', sa.Text(), nullable=True),
        sa.Column('amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('currency', sa.Text(), nullable=False),
        sa.Column('amount_usd', sa.Numeric(12, 2), nullable=False),
        sa.Column('plan', sa.Text(), nullable=True),
        sa.Column('confirmation_code', sa.Text(), nullable=True),
        sa.Column('transaction_id', sa.Text(), nullable=True),
        sa.Column('raw_notify_payload', postgresql.JSONB(), nullable=True),
        sa.Column('user_id', sa.BigInteger(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('confirmed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_payments_user_id', ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name='pk_payments'),
    )
    op.create_index('ix_payments_order_id', 'payments', ['order_id'], unique=True)

    op.create_table(
        'premium_memberships',
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('plan', sa.Text(), server_default='standard', nullable=False),
        sa.Column('amount_paid', sa.Numeric(12, 2), nullable=False),
        sa.Column('currency', sa.Text(), nullable=False),
        sa.Column('amount_paid_usd', sa.Numeric(12, 2), nullable=False),
        sa.Column('purchased_at', sa.Date(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_premium_memberships_user_id', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', name='pk_premium_memberships'),
    )

    op.bulk_insert(
        sa.table(
            'roles',
            sa.column('id', sa.SmallInteger),
            sa.column('name', sa.Text),
            sa.column('description', sa.Text),
        ),
        [
            {'id': 3, 'name': 'premium', 'description': 'Purchased permanent premium membership'},
        ],
    )


def downgrade():
    op.drop_table('premium_memberships')
    op.drop_index('ix_payments_order_id', table_name='payments')
    op.drop_table('payments')
    op.execute("DELETE FROM roles WHERE id = 3")

    bind = op.get_bind()
    payment_status_enum.drop(bind, checkfirst=True)
    payment_purpose_enum.drop(bind, checkfirst=True)

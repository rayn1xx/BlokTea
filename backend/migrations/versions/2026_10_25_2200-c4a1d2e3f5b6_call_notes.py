from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'c4a1d2e3f5b6'
down_revision: Union[str, None] = '97c9f8835934'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'call_notes',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('application_id', sa.Uuid(), nullable=False),
        sa.Column('stage', sa.String(length=32), nullable=False),
        sa.Column('called_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('duration_minutes', sa.Integer(), nullable=True),
        sa.Column('topic', sa.String(length=255), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('agreements', postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column('next_step', sa.Text(), nullable=True),
        sa.Column('next_step_due', sa.Date(), nullable=True),
        sa.Column('author_id', sa.Uuid(), nullable=True),
        sa.Column('author_name', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['application_id'], ['applications.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['author_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_call_notes_application_id'), 'call_notes', ['application_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_call_notes_application_id'), table_name='call_notes')
    op.drop_table('call_notes')

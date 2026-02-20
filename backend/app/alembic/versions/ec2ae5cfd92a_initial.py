"""initial

Revision ID: ec2ae5cfd92a
Revises: 
Create Date: 2026-02-12 19:59:46.891483

"""
from alembic import op

from app.models import SQLModel


# revision identifiers, used by Alembic.
revision = 'ec2ae5cfd92a'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    SQLModel.metadata.create_all(bind=op.get_bind())


def downgrade():
    SQLModel.metadata.drop_all(bind=op.get_bind())

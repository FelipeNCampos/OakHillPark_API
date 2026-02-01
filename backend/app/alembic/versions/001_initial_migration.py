"""Initial migration with all models

Revision ID: 001_initial
Revises: 
Create Date: 2026-02-01 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Create user table
    op.create_table('user',
        sa.Column('email', sa.VARCHAR(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('is_superuser', sa.Boolean(), nullable=False),
        sa.Column('full_name', sa.VARCHAR(length=255), nullable=True),
        sa.Column('cargo', sa.Integer(), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('hashed_password', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_email'), 'user', ['email'], unique=True)

    # Create condominio table
    op.create_table('condominio',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('nome', sa.VARCHAR(length=255), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # Create building table
    op.create_table('building',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('nome', sa.VARCHAR(length=255), nullable=False),
        sa.Column('condominio_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['condominio_id'], ['condominio.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create flat table
    op.create_table('flat',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('numero', sa.Integer(), nullable=False),
        sa.Column('status', sa.Boolean(), nullable=False),
        sa.Column('building_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['building_id'], ['building.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create morador table
    op.create_table('morador',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('cargo', sa.Integer(), nullable=False),
        sa.Column('nome', sa.VARCHAR(length=255), nullable=False),
        sa.Column('email', sa.VARCHAR(length=255), nullable=True),
        sa.Column('mobile', sa.Integer(), nullable=False),
        sa.Column('car1', sa.VARCHAR(length=50), nullable=True),
        sa.Column('car2', sa.VARCHAR(length=50), nullable=True),
        sa.Column('car3', sa.VARCHAR(length=50), nullable=True),
        sa.Column('flat_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['flat_id'], ['flat.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create funcionario table
    op.create_table('funcionario',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('status', sa.Boolean(), nullable=False),
        sa.Column('nome', sa.VARCHAR(length=255), nullable=False),
        sa.Column('mobile', sa.Integer(), nullable=False),
        sa.Column('cargo', sa.Integer(), nullable=False),
        sa.Column('email', sa.VARCHAR(length=255), nullable=True),
        sa.Column('condominio_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['condominio_id'], ['condominio.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create acess table
    op.create_table('acess',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('status', sa.Boolean(), nullable=False),
        sa.Column('data', sa.DateTime(timezone=True), nullable=False),
        sa.Column('operacao', sa.Integer(), nullable=False),
        sa.Column('building_id', sa.UUID(), nullable=False),
        sa.Column('funcionario_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['building_id'], ['building.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['funcionario_id'], ['funcionario.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create readings table
    op.create_table('readings',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('data', sa.DateTime(timezone=True), nullable=False),
        sa.Column('tipo', sa.Integer(), nullable=False),
        sa.Column('valor', sa.Integer(), nullable=False),
        sa.Column('building_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['building_id'], ['building.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade():
    op.drop_table('readings')
    op.drop_table('acess')
    op.drop_table('funcionario')
    op.drop_table('morador')
    op.drop_table('flat')
    op.drop_table('building')
    op.drop_table('condominio')
    op.drop_index(op.f('ix_user_email'), table_name='user')
    op.drop_table('user')

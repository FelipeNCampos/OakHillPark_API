#! /usr/bin/env bash

set -e
set -x

# Let the DB start
python app/backend_pre_start.py

# A brand-new database is bootstrapped by the initial migration, which creates
# the current SQLModel metadata in one step. Replaying the later historical
# migrations after that would attempt to create those tables again. Existing
# databases, on the other hand, continue through every Alembic branch normally.
if python -c "from sqlalchemy import inspect; from app.core.db import engine; raise SystemExit(0 if inspect(engine).has_table('alembic_version') else 1)"; then
    alembic upgrade heads
else
    alembic upgrade ec2ae5cfd92a
    alembic stamp heads
fi

# Create initial data in DB
python app/initial_data.py

# Populate historical data after migrations (from app directory)
python -m scripts.populate_readings
python -m scripts.populate_moradores

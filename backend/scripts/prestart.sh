#! /usr/bin/env bash

set -e
set -x

# Let the DB start
python app/backend_pre_start.py

# Run migrations
alembic upgrade head

# Create initial data in DB
python app/initial_data.py

# Populate historical data after migrations (from app directory)
python -m scripts.populate_readings
python -m scripts.populate_moradores

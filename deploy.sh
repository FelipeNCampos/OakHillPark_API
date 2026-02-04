#!/bin/bash
set -e

SERVER="root@72.60.20.247"
REMOTE_DIR="/root/code/OakHillPark_API"

echo "📦 Starting deployment to $SERVER..."

# Create remote directory
ssh $SERVER "mkdir -p $REMOTE_DIR"

# Copy project files using rsync (respects .gitignore)
echo "📤 Syncing files..."
rsync -av --delete \
  --filter=":- .gitignore" \
  --exclude=".git" \
  --exclude=".env" \
  --exclude="*.pyc" \
  --exclude="__pycache__" \
  --exclude="node_modules" \
  --exclude=".venv" \
  --exclude="htmlcov" \
  --exclude="test-results" \
  --exclude="playwright-report" \
  ./ $SERVER:$REMOTE_DIR/

# Copy production environment file
echo "📝 Copying production .env..."
scp .env.production $SERVER:$REMOTE_DIR/.env

# Deploy with Docker Compose
echo "🚀 Building and starting containers..."
ssh $SERVER "cd $REMOTE_DIR && docker compose -f compose.yml build && docker compose -f compose.yml up -d"

echo "✅ Deploy completed!"
echo ""
echo "🌐 Your application should be available at:"
echo "   Frontend: https://dashboard.oakhillpark.cloud"
echo "   Backend API: https://api.oakhillpark.cloud/docs"
echo "   Adminer: https://adminer.oakhillpark.cloud"
echo "   Traefik Dashboard: https://traefik.oakhillpark.cloud"

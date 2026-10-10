#!/usr/bin/env bash
# Render Build Script for Outreach Dashboard
# Exit immediately if a command exits with a non-zero status
set -o errexit

echo "📦 Installing project dependencies..."
npm install

echo "🛠️ Building client application..."
npm run build

echo "🌐 Installing Chrome for headless lead scraping..."
npx -y @puppeteer/browsers install chrome@stable --path ./chrome-bin || echo "Puppeteer Chrome installation skipped or fallback used"

echo "🗄️ Running database migrations..."
npm run db:migrate || true

echo "✅ Render build complete!"

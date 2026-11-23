#!/usr/bin/env bash
# Render Build Script for Outreach Dashboard
# Exit immediately if a command exits with a non-zero status
set -o errexit

echo "📦 Installing project dependencies..."
npm install

echo "🌐 Pre-installing Headless Chrome for lead scraping and PDF generation..."
npx -y @puppeteer/browsers install chrome-headless-shell@stable --path "./chrome-bin" || npx -y @puppeteer/browsers install chrome@stable --path "./chrome-bin" || true

echo "🛠️ Building client application..."
npm run build

echo "🗄️ Running database migrations..."
npm run db:migrate || true

echo "✅ Render build complete!"

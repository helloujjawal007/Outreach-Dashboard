#!/usr/bin/env node

/**
 * 24/7 Keep-Alive Service for Render Deployment
 * 
 * Render Free Tier web services spin down / sleep after 15 minutes of inactivity.
 * This script sends a lightweight HTTP ping every 12 minutes to ensure the server
 * stays awake and responsive with zero cold-start delay.
 * 
 * Usage:
 *   node scripts/keep-alive.js
 *   npm run keep-alive
 *   TARGET_URL=https://your-app.onrender.com/api INTERVAL_MINUTES=12 npm run keep-alive
 * 
 * Run in background (survives terminal close):
 *   nohup npm run keep-alive > keep-alive.log 2>&1 &
 */

import https from 'https';
import http from 'http';

// Configurable target URL & interval
const defaultUrl = 'https://outreach-dashboard-22t5.onrender.com/api';
const targetUrl = process.env.TARGET_URL || process.argv[2] || defaultUrl;

const parsedInterval = parseInt(process.env.INTERVAL_MINUTES || '12', 10);
const intervalMinutes = isNaN(parsedInterval) || parsedInterval <= 0 ? 12 : parsedInterval;
const intervalMs = intervalMinutes * 60 * 1000;

let pingCount = 0;
let successCount = 0;
let failureCount = 0;
const startTime = Date.now();

function formatUptime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

function getTimestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function sendPing(url, retry = 0) {
  pingCount++;
  const reqStart = Date.now();
  const currentPing = pingCount;

  console.log(`[${getTimestamp()}] [#${currentPing}] Pinging ${url}...`);

  const client = url.startsWith('https:') ? https : http;

  const req = client.get(url, {
    timeout: 30000,
    headers: {
      'User-Agent': 'Render-KeepAlive-Bot/1.0 (+https://onrender.com)',
      'Accept': '*/*',
    },
  }, (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
      const duration = Date.now() - reqStart;
      if (res.statusCode >= 200 && res.statusCode < 400) {
        successCount++;
        console.log(`[${getTimestamp()}] [#${currentPing}] ✅ SUCCESS: HTTP ${res.statusCode} (${duration}ms) | Server is Awake`);
      } else {
        failureCount++;
        console.warn(`[${getTimestamp()}] [#${currentPing}] ⚠️ WARNING: HTTP ${res.statusCode} (${duration}ms)`);
      }
      console.log(`               Stats: ${successCount} successful | ${failureCount} failed | Uptime: ${formatUptime(Date.now() - startTime)}`);
      console.log(`               Next ping scheduled in ${intervalMinutes} minutes.`);
    });
  });

  req.on('timeout', () => {
    req.destroy();
    const duration = Date.now() - reqStart;
    console.error(`[${getTimestamp()}] [#${currentPing}] ⏱️ TIMEOUT after ${duration}ms (Service may be cold-booting)`);
    handleRetry(url, retry);
  });

  req.on('error', (err) => {
    const duration = Date.now() - reqStart;
    console.error(`[${getTimestamp()}] [#${currentPing}] ❌ ERROR (${duration}ms): ${err.message}`);
    handleRetry(url, retry);
  });
}

function handleRetry(url, retry) {
  failureCount++;
  if (retry < 2) {
    const retryDelay = 25; // 25 seconds retry
    console.log(`               Retrying ping in ${retryDelay}s (Attempt ${retry + 2}/3)...`);
    setTimeout(() => {
      sendPing(url, retry + 1);
    }, retryDelay * 1000);
  } else {
    console.log(`               All retries exhausted for this cycle. Next regular ping in ${intervalMinutes}m.`);
  }
}

console.log('====================================================');
console.log(' 🚀 Render Keep-Alive Pinger Active');
console.log(` 🎯 Target:   ${targetUrl}`);
console.log(` ⏱️ Interval: Every ${intervalMinutes} minutes`);
console.log(' 🛡️ Purpose:  Prevent Render 15-minute sleep state');
console.log('====================================================\n');

// 1. Initial ping immediately on startup
sendPing(targetUrl);

// 2. Scheduled recurring ping every 12 minutes
const intervalTimer = setInterval(() => {
  sendPing(targetUrl);
}, intervalMs);

// Graceful shutdown handling
function shutdown() {
  console.log('\n\nStopping Keep-Alive Pinger...');
  clearInterval(intervalTimer);
  console.log('====================================================');
  console.log(` Total Pings:     ${pingCount}`);
  console.log(` Successful:      ${successCount}`);
  console.log(` Failed:          ${failureCount}`);
  console.log(` Total Runtime:   ${formatUptime(Date.now() - startTime)}`);
  console.log('====================================================');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
// Active SMTP configured

function getEnvVar(...keys: string[]): string {
  for (const key of keys) {
    if (process.env[key] !== undefined && process.env[key] !== '') {
      return process.env[key]!.trim();
    }
  }
  // Case-insensitive & symbol-agnostic fallback (handles "SMTP Host", "SMTP Username", etc.)
  const envKeys = Object.keys(process.env);
  for (const targetKey of keys) {
    const normalizedTarget = targetKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    const found = envKeys.find(
      (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedTarget
    );
    if (found && process.env[found]) {
      return process.env[found]!.trim();
    }
  }
  return '';
}

// Extract clean host, stripping explanatory parentheticals like " (or Google Workspace...)"
function cleanHostValue(rawHost: string, user: string): string {
  const cleaned = rawHost.split('(')[0].trim().replace(/['"]/g, '');
  // If host is numeric (e.g. port 465 was entered as host), empty, or placeholder for cloudconsultancy.in, resolve to Zoho India
  if (
    !cleaned ||
    /^\d+$/.test(cleaned) ||
    cleaned.length < 4 ||
    cleaned === 'smtp.cloudconsultancy.in' ||
    (user.includes('cloudconsultancy.in') && cleaned.includes('cloudconsultancy.in'))
  ) {
    return 'smtppro.zoho.in';
  }
  return cleaned;
}

// Extract clean IMAP host
function cleanImapHostValue(rawHost: string, user: string): string {
  const cleaned = rawHost.split('(')[0].trim().replace(/['"]/g, '');
  if (
    !cleaned ||
    /^\d+$/.test(cleaned) ||
    cleaned.length < 4 ||
    cleaned === 'imap.cloudconsultancy.in' ||
    (user.includes('cloudconsultancy.in') && (cleaned.includes('cloudconsultancy.in') || cleaned.includes('gmail')))
  ) {
    return 'imappro.zoho.in';
  }
  return cleaned;
}

// Extract clean port from strings like "465 (SSL) or 587 (TLS)" or "465"
function cleanPortValue(rawPort: string, defaultPort: number): number {
  if (!rawPort) return defaultPort;
  const match = rawPort.match(/\d+/);
  return match ? parseInt(match[0], 10) : defaultPort;
}

const rawUser = getEnvVar('SMTP_USER', 'SMTP_USERNAME', 'SMTP Username', 'SMTP User', 'smtp_user', 'SMTP_EMAIL') || 'sales@cloudconsultancy.in';
const rawPass = getEnvVar('SMTP_PASS', 'SMTP_PASSWORD', 'SMTP Password', 'SMTP Pass', 'smtp_pass');
const rawHost = getEnvVar('SMTP_HOST', 'SMTP Host', 'smtp_host', 'SMTP_SERVER', 'SMTP Server');
const rawPort = getEnvVar('SMTP_PORT', 'SMTP Port', 'smtp_port');
const rawFrom = getEnvVar('SMTP_FROM', 'SMTP From', 'smtp_from') || '"Cloud Consultancy" <sales@cloudconsultancy.in>';
const rawImapHost = getEnvVar('IMAP_HOST', 'IMAP Host', 'IMAP Host (Optional)', 'imap_host');
const rawImapPort = getEnvVar('IMAP_PORT', 'IMAP Port', 'IMAP Port (Optional)', 'imap_port');

const parsedSmtpHost = cleanHostValue(rawHost, rawUser);
const parsedSmtpPort = cleanPortValue(rawPort, 465);
const parsedImapHost = cleanImapHostValue(rawImapHost, rawUser);
const parsedImapPort = cleanPortValue(rawImapPort, 993);

// Detect if password is placeholder text from instructions
const isPlaceholderPass = /app password or email account password/i.test(rawPass);
if (isPlaceholderPass) {
  console.warn('[Server Config Warning] ⚠️ SMTP_PASS is set to the placeholder text "App Password or Email Account Password". Please update Render with your real Zoho App Password.');
}

export const env = {
  PORT: parseInt(process.env.PORT || '5001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://localhost:5432/outreach_dashboard',
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'llama3.1:8b',
  // SMTP Configuration for live email delivery
  SMTP_HOST: parsedSmtpHost,
  SMTP_PORT: parsedSmtpPort,
  SMTP_SECURE: process.env.SMTP_SECURE === 'true' || parsedSmtpPort === 465,
  SMTP_USER: rawUser,
  SMTP_PASS: isPlaceholderPass ? '' : rawPass,
  SMTP_FROM: rawFrom,
  // IMAP Configuration for inbound / sent sync
  IMAP_HOST: parsedImapHost,
  IMAP_PORT: parsedImapPort,
  // Security & Authentication
  ADMIN_PASSWORD: getEnvVar('ADMIN_PASSWORD', 'DASHBOARD_PASSWORD') || 'admin123',
  SESSION_SECRET: getEnvVar('SESSION_SECRET', 'JWT_SECRET') || 'ods-outreach-dashboard-secret-key-2026',
};



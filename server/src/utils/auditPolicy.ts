import fs from 'fs';
import path from 'path';

export interface AuditValidationResult {
  ready: boolean;
  noOpportunity?: boolean;
  findings: string[];
  score: number;
  pdfPath?: string;
  pdfName?: string;
  reason?: string;
}

/**
 * Validates that a PDF file on disk is valid:
 * - File exists
 * - File size is at least 500 bytes and at most 15 MB
 * - File begins with the standard %PDF- header magic bytes
 */
export function isValidPdfFile(filePath: string | null | undefined): boolean {
  if (!filePath) return false;
  try {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) return false;
    const stats = fs.statSync(resolved);
    if (stats.size < 500 || stats.size > 15 * 1024 * 1024) return false;

    // Verify magic bytes %PDF-
    const fd = fs.openSync(resolved, 'r');
    const headerBuf = Buffer.alloc(5);
    fs.readSync(fd, headerBuf, 0, 5, 0);
    fs.closeSync(fd);
    return headerBuf.toString('ascii').startsWith('%PDF-');
  } catch {
    return false;
  }
}

/**
 * Validates a base64 or raw buffer as a valid PDF
 */
export function isValidPdfBuffer(buf: Buffer): boolean {
  if (!buf || buf.length < 500 || buf.length > 15 * 1024 * 1024) return false;
  return buf.subarray(0, 5).toString('ascii').startsWith('%PDF-');
}

/**
 * Normalizes a finding entry (string or structured object) into a readable summary string.
 */
export function normalizeAuditFinding(item: any): string {
  if (typeof item === 'string') return item.trim();
  if (item && typeof item === 'object') {
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const detail =
      typeof item.description === 'string'
        ? item.description.trim()
        : typeof item.detail === 'string'
        ? item.detail.trim()
        : typeof item.message === 'string'
        ? item.message.trim()
        : typeof item.issue === 'string'
        ? item.issue.trim()
        : '';
    if (title && detail && title !== detail) return `${title}: ${detail}`;
    return title || detail;
  }
  return '';
}

/**
 * Unified Audit Readiness Policy:
 * 1. Requires at least 1 concrete finding. If an audit returns 0 critical flaws (pristine site),
 *    a positive baseline diagnostic finding is synthesized so valid leads are never falsely blocked.
 * 2. Sites with 1-2 findings are completely valid and ready.
 * 3. A valid PDF file (> 500 B, < 15 MB, %PDF- header) must exist on disk.
 */
export function validateAuditAsset(
  findingsRaw: any,
  pdfPath: string | null | undefined,
  scoreRaw?: number | null,
  keyTakeawaysRaw?: string | null
): AuditValidationResult {
  // 1. Normalize findings
  let findings: string[] = [];
  if (Array.isArray(findingsRaw)) {
    findings = findingsRaw.map(normalizeAuditFinding).filter(Boolean);
  } else if (typeof findingsRaw === 'string') {
    try {
      const parsed = JSON.parse(findingsRaw);
      if (Array.isArray(parsed)) {
        findings = parsed.map(normalizeAuditFinding).filter(Boolean);
      }
    } catch {
      findings = findingsRaw
        .split(/;|\n|•/)
        .map((s) => s.trim())
        .filter((s) => s.length > 5);
    }
  }

  // Fallback to key takeaways if findings array is empty
  if (findings.length === 0 && keyTakeawaysRaw) {
    findings = keyTakeawaysRaw
      .split(/;|\n|•| and /i)
      .map((s) => s.trim())
      .filter((s) => s.length > 5);
  }

  const score = typeof scoreRaw === 'number' ? scoreRaw : 75;

  // Clean sites: do NOT synthesize findings. Add a noOpportunity path:
  // skip the lead with a clear reason, no failure_log entry, and do not email invented problems.
  if (findings.length === 0) {
    return {
      ready: false,
      noOpportunity: true,
      findings: [],
      score,
      pdfPath: pdfPath || undefined,
      reason: 'Clean site: 0 technical flaws detected (no opportunity for audit outreach)',
    };
  }

  // 2. Validate PDF file
  const pdfValid = isValidPdfFile(pdfPath);
  if (!pdfValid) {
    return {
      ready: false,
      findings,
      score,
      pdfPath: pdfPath || undefined,
      reason: 'PDF report missing, undersized (<500B), or invalid %PDF- header',
    };
  }

  return {
    ready: true,
    findings,
    score,
    pdfPath: pdfPath || undefined,
    pdfName: pdfPath ? path.basename(pdfPath) : undefined,
  };
}


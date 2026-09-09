import type { Lead } from '@/types';
import { uid } from '@/mockData';

export interface ParsedLeadRow {
  tempId: string;
  businessName: string;
  category: string;
  phone: string;
  email: string;
  instagram: string;
  facebook: string;
  whatsapp: string;
  isDuplicate: boolean;
  duplicateReason?: string;
  isIncomplete: boolean;
}

function cleanValue(v: string): string {
  return v.replace(/^["']|["']$/g, '').trim();
}

function normalizePhone(p: string): string {
  return p.replace(/\D/g, '');
}

/**
 * Parses pasted raw text or CSV content into lead rows.
 * Expected CSV header: business_name,category,phone,email,instagram,facebook,whatsapp
 * Supports varied headers like company, industry, tel, ig, wa, fb.
 */
export function parseImport(rawText: string): ParsedLeadRow[] {
  const text = rawText.trim();
  if (!text) return [];

  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  const firstLine = lines[0].toLowerCase();
  const hasHeader =
    firstLine.includes('business') ||
    firstLine.includes('company') ||
    firstLine.includes('email') ||
    firstLine.includes('phone') ||
    firstLine.includes('name');

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rawHeaders = hasHeader
    ? parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim().replace(/[\s_-]+/g, ''))
    : ['businessname', 'category', 'phone', 'email', 'instagram', 'facebook', 'whatsapp'];

  const rows: ParsedLeadRow[] = [];

  for (const line of dataLines) {
    if (!line.trim()) continue;
    const parts = parseCsvLine(line);

    const get = (...possibleKeys: string[]): string => {
      for (const key of possibleKeys) {
        const idx = rawHeaders.findIndex((h) => h === key || h.includes(key));
        if (idx >= 0 && parts[idx]) {
          return cleanValue(parts[idx]);
        }
      }
      return '';
    };

    const businessName = get('businessname', 'company', 'name', 'business') || '';
    const category = get('category', 'industry', 'niche', 'notes') || '';
    const phone = get('phone', 'tel', 'mobile', 'cell') || '';
    const email = get('email', 'mail') || '';
    const instagram = get('instagram', 'ig', 'insta') || '';
    const facebook = get('facebook', 'fb') || '';
    const whatsapp = get('whatsapp', 'wa') || '';

    // Ignore completely empty rows
    if (!businessName && !email && !phone && !instagram && !facebook && !whatsapp) continue;

    rows.push({
      tempId: uid('row'),
      businessName,
      category,
      phone,
      email,
      instagram,
      facebook,
      whatsapp,
      isDuplicate: false,
      isIncomplete: false,
    });
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const delimiter = line.includes('\t') ? '\t' : ',';
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Deduplicates rows against:
 * 1. Existing database leads & clients
 * 2. Intra-batch duplicates (same email or phone appearing twice in the file)
 */
export function markDuplicates(rows: ParsedLeadRow[], existingRecords: Lead[]): ParsedLeadRow[] {
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  // Pre-populate with existing database records (both leads and clients)
  for (const item of existingRecords) {
    if (item.email) seenEmails.add(item.email.trim().toLowerCase());
    const digits = normalizePhone(item.phone || '');
    if (digits) seenPhones.add(digits);
  }

  return rows.map((row) => {
    const emailKey = row.email ? row.email.trim().toLowerCase() : '';
    const phoneKey = row.phone ? normalizePhone(row.phone) : '';

    let isDuplicate = false;
    let duplicateReason = '';

    if (emailKey && seenEmails.has(emailKey)) {
      isDuplicate = true;
      duplicateReason = `Email ${emailKey} already exists`;
    } else if (phoneKey && phoneKey.length >= 7 && seenPhones.has(phoneKey)) {
      isDuplicate = true;
      duplicateReason = `Phone number already exists`;
    }

    // If this row is valid and not a dupe, record it so subsequent batch items with same details are caught
    if (!isDuplicate) {
      if (emailKey) seenEmails.add(emailKey);
      if (phoneKey && phoneKey.length >= 7) seenPhones.add(phoneKey);
    }

    return {
      ...row,
      isDuplicate,
      duplicateReason,
    };
  });
}

/**
 * Flags rows missing all contact channels (email, phone, IG, FB, WA)
 */
export function markIncomplete(rows: ParsedLeadRow[]): ParsedLeadRow[] {
  return rows.map((row) => {
    const hasContact =
      !!row.email || !!row.phone || !!row.instagram || !!row.facebook || !!row.whatsapp;
    return { ...row, isIncomplete: !hasContact };
  });
}

export function parsedRowToLead(row: ParsedLeadRow): Lead {
  return {
    id: uid('lead'),
    businessName: row.businessName || 'Unnamed Business',
    category: row.category || 'Uncategorized',
    phone: row.phone,
    email: row.email,
    instagram: row.instagram,
    facebook: row.facebook,
    whatsapp: row.whatsapp,
    consentStatus: 'none',
    entityType: 'lead',
    createdAt: new Date().toISOString(),
    lastContactedAt: null,
  };
}

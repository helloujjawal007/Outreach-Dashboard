import type { Lead } from '../types';
import { uid } from '../mockData';

export interface ParsedLeadRow {
  tempId: string;
  businessName: string;
  category: string;
  phone: string;
  email: string;
  instagram: string;
  facebook: string;
  whatsapp: string;
  linkedin?: string;
  website?: string;
  country?: string;
  notes?: string;
  isDuplicate: boolean;
  duplicateReason?: string;
  isIncomplete: boolean;
}

function cleanValue(v: string): string {
  return v.replace(/^["']|["']$/g, '').trim();
}

export function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

export function extractPhoneKeys(phone: string): { full: string; last10: string } {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 7) {
    return { full: '', last10: '' };
  }
  const last10 = digits.length >= 10 ? digits.slice(-10) : '';
  return { full: digits, last10 };
}

export function normalizeBusinessName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/\b(llc|inc|corp|corporation|ltd|limited|co|company)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Parses pasted raw text or CSV content into lead rows.
 * Supports standard CSV and custom CRM exports with varied column headers.
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
    ? parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim().replace(/[\s/_-]+/g, ''))
    : ['businessname', 'category', 'phone', 'email', 'instagram', 'facebook', 'whatsapp', 'linkedin'];

  const rows: ParsedLeadRow[] = [];

  for (const line of dataLines) {
    if (!line.trim()) continue;
    const parts = parseCsvLine(line);

    const get = (...possibleKeys: string[]): string => {
      for (const key of possibleKeys) {
        // Exact match first
        let idx = rawHeaders.findIndex((h) => h === key);
        if (idx >= 0 && parts[idx] !== undefined && parts[idx] !== '') {
          return cleanValue(parts[idx]);
        }
        // Substring match second
        idx = rawHeaders.findIndex((h) => h.includes(key));
        if (idx >= 0 && parts[idx] !== undefined && parts[idx] !== '') {
          return cleanValue(parts[idx]);
        }
      }
      return '';
    };

    const businessName = get('businessname', 'companyname', 'company', 'name', 'business') || '';

    // Category / Niche mapping (strictly excludes notes!)
    let category = get('category', 'industry', 'niche', 'vertical', 'services', 'service', 'trade', 'type') || '';
    if (!category && businessName) {
      const bn = businessName.toLowerCase();
      if (bn.includes('plumb') || bn.includes('drain')) category = 'Plumbing & Drain Services';
      else if (bn.includes('electric')) category = 'Electrical Services';
      else if (bn.includes('roof')) category = 'Roofing & Construction';
      else if (bn.includes('hvac') || bn.includes('air condition') || bn.includes('heating')) category = 'HVAC & Climate';
      else if (bn.includes('dent') || bn.includes('clinic') || bn.includes('doctor')) category = 'Healthcare & Dental';
      else if (bn.includes('gym') || bn.includes('fitness') || bn.includes('yoga')) category = 'Fitness & Wellness';
      else if (bn.includes('law') || bn.includes('attorney') || bn.includes('legal')) category = 'Legal Services';
      else if (bn.includes('auto') || bn.includes('repair') || bn.includes('motor')) category = 'Auto Services';
      else category = 'General Business';
    } else if (!category) {
      category = 'General Business';
    }

    const phone = get('phone', 'tel', 'mobile', 'cell', 'telephone') || '';
    const email = get('contactemail', 'email', 'mail') || '';
    const instagram = get('instagram', 'ig', 'insta') || '';
    const facebook = get('facebook', 'fb') || '';
    const whatsapp = get('whatsapp', 'wa') || '';
    const linkedin = get('linkedin', 'li', 'linkedinurl', 'profile') || '';

    // Capture notes and rich supplemental attributes (City, Region, Country, Rating, Reviews, Website)
    const rawNotes = get('leadnotes', 'notes', 'note', 'comment', 'comments', 'description', 'remark', 'remarks') || '';
    const cityRegion = get('cityregion', 'city', 'region', 'location', 'state') || '';
    const country = get('country', 'nation') || '';
    const website = get('website', 'site', 'url', 'web', 'homepage') || '';
    const rating = get('googlerating', 'rating') || '';
    const reviewCount = get('reviewcount', 'reviews') || '';

    const noteParts: string[] = [];
    if (rawNotes) noteParts.push(rawNotes);
    if (cityRegion) noteParts.push(`Location: ${cityRegion}`);
    if (country) noteParts.push(`Country: ${country}`);
    if (website) noteParts.push(`Website: ${website}`);
    if (rating) noteParts.push(`Rating: ${rating}★${reviewCount ? ` (${reviewCount} reviews)` : ''}`);

    const notes = noteParts.join(' | ');

    // Ignore completely empty rows
    if (!businessName && !email && !phone && !instagram && !facebook && !whatsapp && !linkedin && !website) continue;

    rows.push({
      tempId: uid('row'),
      businessName,
      category,
      phone,
      email,
      instagram,
      facebook,
      whatsapp,
      linkedin,
      website,
      country,
      notes,
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
 * 1. Existing database leads & clients (by email, phone with country code tolerance, and business name)
 * 2. Intra-batch duplicates (same email, phone, or business appearing earlier in the file)
 */
export function markDuplicates(rows: ParsedLeadRow[], existingRecords: Lead[]): ParsedLeadRow[] {
  const seenEmails = new Map<string, string>();
  const seenFullPhones = new Map<string, string>();
  const seenLast10Phones = new Map<string, string>();
  const seenBusinessNames = new Map<string, string>();

  // Pre-populate with existing database records (both leads and clients)
  for (const item of existingRecords) {
    if (item.deletedAt) continue;
    const sourceLabel = item.businessName || 'Existing Record';

    const email = normalizeEmail(item.email || '');
    if (email) seenEmails.set(email, sourceLabel);

    const pKeys = extractPhoneKeys(item.phone || '');
    if (pKeys.full) seenFullPhones.set(pKeys.full, sourceLabel);
    if (pKeys.last10) seenLast10Phones.set(pKeys.last10, sourceLabel);

    const waKeys = extractPhoneKeys(item.whatsapp || '');
    if (waKeys.full) seenFullPhones.set(waKeys.full, sourceLabel);
    if (waKeys.last10) seenLast10Phones.set(waKeys.last10, sourceLabel);

    const cleanName = normalizeBusinessName(item.businessName || '');
    if (cleanName.length >= 3) {
      seenBusinessNames.set(cleanName, item.businessName);
    }
  }

  return rows.map((row) => {
    const email = normalizeEmail(row.email || '');
    const pKeys = extractPhoneKeys(row.phone || '');
    const waKeys = extractPhoneKeys(row.whatsapp || '');
    const cleanName = normalizeBusinessName(row.businessName || '');

    let isDuplicate = false;
    let duplicateReason = '';

    if (email && seenEmails.has(email)) {
      isDuplicate = true;
      duplicateReason = `Email ${email} already exists (${seenEmails.get(email)})`;
    } else if (pKeys.full && seenFullPhones.has(pKeys.full)) {
      isDuplicate = true;
      duplicateReason = `Phone number already exists (${seenFullPhones.get(pKeys.full)})`;
    } else if (pKeys.last10 && seenLast10Phones.has(pKeys.last10)) {
      isDuplicate = true;
      duplicateReason = `Phone number already exists (${seenLast10Phones.get(pKeys.last10)})`;
    } else if (waKeys.full && seenFullPhones.has(waKeys.full)) {
      isDuplicate = true;
      duplicateReason = `WhatsApp number already exists (${seenFullPhones.get(waKeys.full)})`;
    } else if (waKeys.last10 && seenLast10Phones.has(waKeys.last10)) {
      isDuplicate = true;
      duplicateReason = `WhatsApp number already exists (${seenLast10Phones.get(waKeys.last10)})`;
    } else if (cleanName.length >= 3 && seenBusinessNames.has(cleanName)) {
      isDuplicate = true;
      duplicateReason = `Business "${seenBusinessNames.get(cleanName)}" already exists in CRM`;
    }

    // If this row is valid and not a dupe, record it so subsequent batch items with same details are caught
    if (!isDuplicate) {
      const fileLabel = row.businessName || 'Row in this file';
      if (email) seenEmails.set(email, `${fileLabel} (earlier in file)`);
      if (pKeys.full) seenFullPhones.set(pKeys.full, `${fileLabel} (earlier in file)`);
      if (pKeys.last10) seenLast10Phones.set(pKeys.last10, `${fileLabel} (earlier in file)`);
      if (waKeys.full) seenFullPhones.set(waKeys.full, `${fileLabel} (earlier in file)`);
      if (waKeys.last10) seenLast10Phones.set(waKeys.last10, `${fileLabel} (earlier in file)`);
      if (cleanName.length >= 3) seenBusinessNames.set(cleanName, `${row.businessName} (earlier in file)`);
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
      !!row.email || !!row.phone || !!row.instagram || !!row.facebook || !!row.whatsapp || !!row.linkedin;
    return { ...row, isIncomplete: !hasContact };
  });
}

export function parsedRowToLead(row: ParsedLeadRow): Lead {
  return {
    id: uid('lead'),
    businessName: row.businessName || 'Unnamed Business',
    category: row.category || 'General Business',
    phone: row.phone,
    email: row.email,
    instagram: row.instagram,
    facebook: row.facebook,
    whatsapp: row.whatsapp,
    linkedin: row.linkedin || '',
    website: row.website || '',
    country: row.country || '',
    notes: row.notes || '',
    consentStatus: 'none',
    entityType: 'lead',
    createdAt: new Date().toISOString(),
    lastContactedAt: null,
  };
}

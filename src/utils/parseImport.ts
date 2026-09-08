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
  isIncomplete: boolean;
}

function cleanValue(v: string): string {
  return v.trim();
}

/**
 * Parses pasted raw text or CSV content into lead rows.
 * Expected CSV header: business_name,category,phone,email,instagram,facebook,whatsapp
 * If no header is detected, tries comma-separated pipe fallback.
 */
export function parseImport(rawText: string): ParsedLeadRow[] {
  const text = rawText.trim();
  if (!text) return [];

  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  const firstLine = lines[0].toLowerCase();
  const hasHeader =
    firstLine.includes('business') ||
    firstLine.includes('email') ||
    firstLine.includes('phone') ||
    firstLine.includes('name');

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const headers = hasHeader
    ? firstLine.split(',').map((h) => h.trim())
    : ['business_name', 'category', 'phone', 'email', 'instagram', 'facebook', 'whatsapp'];

  const rows: ParsedLeadRow[] = [];

  for (const line of dataLines) {
    const parts = parseCsvLine(line);
    const get = (key: string): string => {
      const idx = headers.indexOf(key);
      return idx >= 0 ? cleanValue(parts[idx] || '') : '';
    };

    const businessName = get('business_name') || get('business') || get('name') || '';
    const category = get('category') || get('notes') || '';
    const phone = get('phone') || '';
    const email = get('email') || '';
    const instagram = get('instagram') || get('ig') || '';
    const facebook = get('facebook') || get('fb') || '';
    const whatsapp = get('whatsapp') || get('wa') || '';

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
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export function markDuplicates(rows: ParsedLeadRow[], existingLeads: Lead[]): ParsedLeadRow[] {
  return rows.map((row) => {
    const isDuplicate = existingLeads.some((lead) => {
      if (row.email && lead.email && row.email.toLowerCase() === lead.email.toLowerCase()) return true;
      if (row.phone && lead.phone && row.phone.replace(/\D/g, '') === lead.phone.replace(/\D/g, '')) return true;
      return false;
    });
    return { ...row, isDuplicate };
  });
}

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

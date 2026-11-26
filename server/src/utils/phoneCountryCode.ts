const COUNTRY_CALLING_CODES: Array<{ match: RegExp; code: string }> = [
  { match: /^(usa|us|u\.s\.a?\.?|united states(?: of america)?|canada|ca)$/i, code: '1' },
  { match: /^(india|in)$/i, code: '91' },
  { match: /^(uk|u\.k\.|united kingdom|england|scotland|wales|northern ireland|great britain|gb)$/i, code: '44' },
  { match: /^(australia|au|aus)$/i, code: '61' },
  { match: /^(germany|de|deutschland)$/i, code: '49' },
  { match: /^(france|fr)$/i, code: '33' },
  { match: /^(uae|united arab emirates|dubai|ae)$/i, code: '971' },
  { match: /^(singapore|sg)$/i, code: '65' },
  { match: /^(new zealand|nz)$/i, code: '64' },
  { match: /^(ireland|ie)$/i, code: '353' },
  { match: /^(spain|es)$/i, code: '34' },
  { match: /^(italy|it)$/i, code: '39' },
  { match: /^(netherlands|nl)$/i, code: '31' },
  { match: /^(south africa|za)$/i, code: '27' },
  { match: /^(malaysia|my)$/i, code: '60' },
  { match: /^(philippines|ph)$/i, code: '63' },
  { match: /^(indonesia|id)$/i, code: '62' },
];

export function resolveCountryCallingCode(country?: string | null, address?: string | null): string {
  const candidates = [country, ...(address ? address.split(',').reverse() : [])];
  for (const raw of candidates) {
    const clean = (raw || '').trim().replace(/\.$/, '');
    if (!clean) continue;
    for (const entry of COUNTRY_CALLING_CODES) {
      if (entry.match.test(clean)) {
        return entry.code;
      }
    }
  }
  return '';
}

/**
 * Ensures any non-empty phone number (>= 7 digits) includes its international country calling code (`+<cc> ...`).
 * Preserves existing `+` prefixes and normalizes `00<cc>` IDD prefixes.
 */
export function ensurePhoneWithCountryCode(
  rawPhone?: string | null,
  context?: { country?: string | null; state?: string | null; address?: string | null }
): string {
  const trimmed = (rawPhone || '').trim();
  if (!trimmed) return '';

  const compact = trimmed.replace(/[^\d+]/g, '');
  let digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7) return '';

  // Already starts with '+' country prefix
  if (compact.startsWith('+')) {
    // Normalize US/CA '+1' or standard '+...' without losing readability
    if (trimmed.startsWith('+')) {
      return trimmed.replace(/\s{2,}/g, ' ').trim();
    }
    return `+${digits}`;
  }

  // International 00 prefix -> convert to '+'
  if (trimmed.startsWith('00') && digits.length > 9) {
    return `+${digits.slice(2)}`;
  }

  const callingCode = resolveCountryCallingCode(context?.country, context?.address);

  // Explicit North America (+1)
  if (callingCode === '1') {
    if (digits.length === 11 && digits.startsWith('1')) {
      const d = digits.slice(1);
      return `+1 ${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    }
    if (digits.length === 10) {
      return `+1 ${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (!digits.startsWith('1')) {
      return `+1 ${digits}`;
    }
    return `+${digits}`;
  }

  // India (+91)
  if (callingCode === '91') {
    if (digits.length === 12 && digits.startsWith('91')) {
      return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
    }
    if (digits.length === 11 && digits.startsWith('0')) {
      const d = digits.slice(1);
      return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
    }
    if (digits.length === 10) {
      return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    }
    return digits.startsWith('91') ? `+${digits}` : `+91 ${digits}`;
  }

  // Known calling code (UK 44, AU 61, DE 49, FR 33, etc.)
  if (callingCode) {
    if (digits.startsWith(callingCode) && digits.length >= callingCode.length + 8) {
      return `+${callingCode} ${digits.slice(callingCode.length)}`;
    }
    const noTrunkZero = digits.replace(/^0+/, '');
    return `+${callingCode} ${noTrunkZero}`;
  }

  // Fallback inference when no country metadata supplied
  if (digits.length === 11 && digits.startsWith('1')) {
    const d = digits.slice(1);
    return `+1 ${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10 && (/^\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}$/.test(trimmed) || !/^[6-9]\d{4}[-\s]\d{5}$/.test(trimmed))) {
    return `+1 ${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return `+${digits}`;
}

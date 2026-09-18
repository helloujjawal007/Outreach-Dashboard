import { query } from '../config/db';

export function cleanSiteUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (
    /google\.com\/maps|maps\.google\.com|goo\.gl\/maps|google\.com\/search/i.test(trimmed)
  ) {
    return '';
  }
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && trimmed.includes('.')) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export interface LeadScrapeResult {
  location: string;
  identified: boolean;
  country?: string;
  siteUrl?: string;
  source: 'email_domain' | 'website_crawl' | 'business_name' | 'area_code' | 'notes' | 'none';
  details?: string;
}

export interface ScraperProgressStatus {
  isRunning: boolean;
  total: number;
  processed: number;
  identifiedCount: number;
  unidentifiedCount: number;
  currentLeadName?: string;
  lastRunAt: string | null;
  message?: string;
}

const COMMON_FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.in',
  'yahoo.ca',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'mail.com',
  'zoho.com',
  'proton.me',
  'protonmail.com',
  'yandex.com',
  'gmx.com',
]);

const NORTH_AMERICAN_AREA_CODES: Record<string, { city: string; state: string; country: string }> = {
  // Canada
  '306': { city: 'Regina / Saskatoon', state: 'SK', country: 'Canada' },
  '639': { city: 'Regina / Saskatoon', state: 'SK', country: 'Canada' },
  '403': { city: 'Calgary', state: 'AB', country: 'Canada' },
  '587': { city: 'Calgary / Edmonton', state: 'AB', country: 'Canada' },
  '780': { city: 'Edmonton', state: 'AB', country: 'Canada' },
  '825': { city: 'Edmonton / Calgary', state: 'AB', country: 'Canada' },
  '604': { city: 'Vancouver', state: 'BC', country: 'Canada' },
  '778': { city: 'Vancouver', state: 'BC', country: 'Canada' },
  '250': { city: 'Kelowna / Victoria', state: 'BC', country: 'Canada' },
  '236': { city: 'Vancouver', state: 'BC', country: 'Canada' },
  '204': { city: 'Winnipeg', state: 'MB', country: 'Canada' },
  '431': { city: 'Winnipeg', state: 'MB', country: 'Canada' },
  '416': { city: 'Toronto', state: 'ON', country: 'Canada' },
  '647': { city: 'Toronto', state: 'ON', country: 'Canada' },
  '905': { city: 'Mississauga / Hamilton', state: 'ON', country: 'Canada' },
  '289': { city: 'Mississauga / Hamilton', state: 'ON', country: 'Canada' },
  '519': { city: 'London / Kitchener', state: 'ON', country: 'Canada' },
  '226': { city: 'London / Kitchener', state: 'ON', country: 'Canada' },
  '613': { city: 'Ottawa', state: 'ON', country: 'Canada' },
  '343': { city: 'Ottawa', state: 'ON', country: 'Canada' },
  '514': { city: 'Montreal', state: 'QC', country: 'Canada' },
  '438': { city: 'Montreal', state: 'QC', country: 'Canada' },
  '450': { city: 'Laval / Longueuil', state: 'QC', country: 'Canada' },
  '902': { city: 'Halifax / Dartmouth', state: 'NS', country: 'Canada' },
  '506': { city: 'Moncton / Saint John', state: 'NB', country: 'Canada' },
  '709': { city: "St. John's", state: 'NL', country: 'Canada' },

  // USA Major Markets
  '509': { city: 'Spokane', state: 'WA', country: 'USA' },
  '208': { city: 'Boise', state: 'ID', country: 'USA' },
  '986': { city: 'Boise', state: 'ID', country: 'USA' },
  '918': { city: 'Tulsa', state: 'OK', country: 'USA' },
  '539': { city: 'Tulsa', state: 'OK', country: 'USA' },
  '423': { city: 'Chattanooga', state: 'TN', country: 'USA' },
  '559': { city: 'Fresno', state: 'CA', country: 'USA' },
  '303': { city: 'Denver', state: 'CO', country: 'USA' },
  '720': { city: 'Denver', state: 'CO', country: 'USA' },
  '512': { city: 'Austin', state: 'TX', country: 'USA' },
  '737': { city: 'Austin', state: 'TX', country: 'USA' },
  '214': { city: 'Dallas', state: 'TX', country: 'USA' },
  '972': { city: 'Dallas', state: 'TX', country: 'USA' },
  '713': { city: 'Houston', state: 'TX', country: 'USA' },
  '281': { city: 'Houston', state: 'TX', country: 'USA' },
  '210': { city: 'San Antonio', state: 'TX', country: 'USA' },
  '206': { city: 'Seattle', state: 'WA', country: 'USA' },
  '425': { city: 'Bellevue', state: 'WA', country: 'USA' },
  '212': { city: 'New York', state: 'NY', country: 'USA' },
  '718': { city: 'Brooklyn / Queens', state: 'NY', country: 'USA' },
  '917': { city: 'New York', state: 'NY', country: 'USA' },
  '312': { city: 'Chicago', state: 'IL', country: 'USA' },
  '773': { city: 'Chicago', state: 'IL', country: 'USA' },
  '213': { city: 'Los Angeles', state: 'CA', country: 'USA' },
  '310': { city: 'Los Angeles', state: 'CA', country: 'USA' },
  '415': { city: 'San Francisco', state: 'CA', country: 'USA' },
  '408': { city: 'San Jose', state: 'CA', country: 'USA' },
  '619': { city: 'San Diego', state: 'CA', country: 'USA' },
  '858': { city: 'San Diego', state: 'CA', country: 'USA' },
  '602': { city: 'Phoenix', state: 'AZ', country: 'USA' },
  '480': { city: 'Scottsdale / Phoenix', state: 'AZ', country: 'USA' },
  '702': { city: 'Las Vegas', state: 'NV', country: 'USA' },
  '305': { city: 'Miami', state: 'FL', country: 'USA' },
  '786': { city: 'Miami', state: 'FL', country: 'USA' },
  '407': { city: 'Orlando', state: 'FL', country: 'USA' },
  '813': { city: 'Tampa', state: 'FL', country: 'USA' },
  '404': { city: 'Atlanta', state: 'GA', country: 'USA' },
  '617': { city: 'Boston', state: 'MA', country: 'USA' },
  '503': { city: 'Portland', state: 'OR', country: 'USA' },
  '215': { city: 'Philadelphia', state: 'PA', country: 'USA' },
  '405': { city: 'Oklahoma City', state: 'OK', country: 'USA' },
  '615': { city: 'Nashville', state: 'TN', country: 'USA' },
  '901': { city: 'Memphis', state: 'TN', country: 'USA' },
  '704': { city: 'Charlotte', state: 'NC', country: 'USA' },
  '919': { city: 'Raleigh', state: 'NC', country: 'USA' },
  '614': { city: 'Columbus', state: 'OH', country: 'USA' },
  '216': { city: 'Cleveland', state: 'OH', country: 'USA' },
  '513': { city: 'Cincinnati', state: 'OH', country: 'USA' },
  '317': { city: 'Indianapolis', state: 'IN', country: 'USA' },
  '414': { city: 'Milwaukee', state: 'WI', country: 'USA' },
  '612': { city: 'Minneapolis', state: 'MN', country: 'USA' },
  '314': { city: 'St. Louis', state: 'MO', country: 'USA' },
  '816': { city: 'Kansas City', state: 'MO', country: 'USA' },
};

const KNOWN_CITY_REGEX: Array<{ regex: RegExp; location: string; country: string }> = [
  // Canada
  { regex: /\b(regina)\b/i, location: 'Regina, SK, Canada', country: 'Canada' },
  { regex: /\b(saskatoon)\b/i, location: 'Saskatoon, SK, Canada', country: 'Canada' },
  { regex: /\b(vancouver)\b/i, location: 'Vancouver, BC, Canada', country: 'Canada' },
  { regex: /\b(kelowna)\b/i, location: 'Kelowna, BC, Canada', country: 'Canada' },
  { regex: /\b(calgary)\b/i, location: 'Calgary, AB, Canada', country: 'Canada' },
  { regex: /\b(edmonton)\b/i, location: 'Edmonton, AB, Canada', country: 'Canada' },
  { regex: /\b(winnipeg)\b/i, location: 'Winnipeg, MB, Canada', country: 'Canada' },
  { regex: /\b(toronto)\b/i, location: 'Toronto, ON, Canada', country: 'Canada' },
  { regex: /\b(mississauga)\b/i, location: 'Mississauga, ON, Canada', country: 'Canada' },
  { regex: /\b(ottawa)\b/i, location: 'Ottawa, ON, Canada', country: 'Canada' },
  { regex: /\b(kitchener|waterloo|cambridge)\b/i, location: 'Kitchener-Waterloo, ON, Canada', country: 'Canada' },
  { regex: /\b(conestogo)\b/i, location: 'Conestogo, ON, Canada', country: 'Canada' },
  { regex: /\b(halifax|dartmouth)\b/i, location: 'Halifax, NS, Canada', country: 'Canada' },
  { regex: /\b(montreal)\b/i, location: 'Montreal, QC, Canada', country: 'Canada' },

  // USA
  { regex: /\b(denver)\b/i, location: 'Denver, CO, USA', country: 'USA' },
  { regex: /\b(austin)\b/i, location: 'Austin, TX, USA', country: 'USA' },
  { regex: /\b(dallas|fort worth)\b/i, location: 'Dallas, TX, USA', country: 'USA' },
  { regex: /\b(houston)\b/i, location: 'Houston, TX, USA', country: 'USA' },
  { regex: /\b(san antonio)\b/i, location: 'San Antonio, TX, USA', country: 'USA' },
  { regex: /\b(seattle)\b/i, location: 'Seattle, WA, USA', country: 'USA' },
  { regex: /\b(portland)\b/i, location: 'Portland, OR, USA', country: 'USA' },
  { regex: /\b(chicago)\b/i, location: 'Chicago, IL, USA', country: 'USA' },
  { regex: /\b(miami)\b/i, location: 'Miami, FL, USA', country: 'USA' },
  { regex: /\b(orlando)\b/i, location: 'Orlando, FL, USA', country: 'USA' },
  { regex: /\b(tampa)\b/i, location: 'Tampa, FL, USA', country: 'USA' },
  { regex: /\b(atlanta)\b/i, location: 'Atlanta, GA, USA', country: 'USA' },
  { regex: /\b(phoenix|scottsdale)\b/i, location: 'Phoenix, AZ, USA', country: 'USA' },
  { regex: /\b(las vegas)\b/i, location: 'Las Vegas, NV, USA', country: 'USA' },
  { regex: /\b(san francisco|bay area)\b/i, location: 'San Francisco, CA, USA', country: 'USA' },
  { regex: /\b(los angeles)\b/i, location: 'Los Angeles, CA, USA', country: 'USA' },
  { regex: /\b(san diego)\b/i, location: 'San Diego, CA, USA', country: 'USA' },
  { regex: /\b(new york|manhattan|brooklyn)\b/i, location: 'New York, NY, USA', country: 'USA' },
  { regex: /\b(boston)\b/i, location: 'Boston, MA, USA', country: 'USA' },
  { regex: /\b(tulsa)\b/i, location: 'Tulsa, OK, USA', country: 'USA' },
  { regex: /\b(boise|meridian|nampa)\b/i, location: 'Boise, ID, USA', country: 'USA' },
  { regex: /\b(spokane)\b/i, location: 'Spokane, WA, USA', country: 'USA' },
  { regex: /\b(chattanooga)\b/i, location: 'Chattanooga, TN, USA', country: 'USA' },
  { regex: /\b(fresno)\b/i, location: 'Fresno, CA, USA', country: 'USA' },

  // India
  { regex: /\b(kasba|kolkata|calcutta)\b/i, location: 'Kolkata, WB, India', country: 'India' },
  { regex: /\b(mumbai|bombay)\b/i, location: 'Mumbai, MH, India', country: 'India' },
  { regex: /\b(delhi|new delhi|noida|gurgaon|gurugram)\b/i, location: 'Delhi NCR, India', country: 'India' },
  { regex: /\b(bangalore|bengaluru)\b/i, location: 'Bengaluru, KA, India', country: 'India' },
  { regex: /\b(hyderabad)\b/i, location: 'Hyderabad, TS, India', country: 'India' },
  { regex: /\b(chennai|madras)\b/i, location: 'Chennai, TN, India', country: 'India' },
  { regex: /\b(pune)\b/i, location: 'Pune, MH, India', country: 'India' },

  // UK & Australia
  { regex: /\b(london)\b/i, location: 'London, United Kingdom', country: 'United Kingdom' },
  { regex: /\b(manchester)\b/i, location: 'Manchester, United Kingdom', country: 'United Kingdom' },
  { regex: /\b(birmingham)\b/i, location: 'Birmingham, United Kingdom', country: 'United Kingdom' },
  { regex: /\b(sydney)\b/i, location: 'Sydney, NSW, Australia', country: 'Australia' },
  { regex: /\b(melbourne)\b/i, location: 'Melbourne, VIC, Australia', country: 'Australia' },
  { regex: /\b(brisbane)\b/i, location: 'Brisbane, QLD, Australia', country: 'Australia' },
  { regex: /\b(perth)\b/i, location: 'Perth, WA, Australia', country: 'Australia' },
];

export class LeadScraperService {
  private progress: ScraperProgressStatus = {
    isRunning: false,
    total: 0,
    processed: 0,
    identifiedCount: 0,
    unidentifiedCount: 0,
    lastRunAt: null,
  };
  private abortController: AbortController | null = null;

  public getStatus(): ScraperProgressStatus {
    return { ...this.progress };
  }

  public stopGradualScrape() {
    if (this.abortController) {
      this.abortController.abort();
      this.progress.isRunning = false;
      this.progress.message = 'Scraping job paused by user';
    }
  }

  /**
   * Fast HTTP scrape of business website to find contact address / postal code
   */
  private async crawlSiteForAddress(siteUrl: string): Promise<{ address?: string; country?: string }> {
    try {
      const cleanUrl = cleanSiteUrl(siteUrl);
      if (!cleanUrl) return {};

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(cleanUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);
      if (!res.ok) return {};

      const html = await res.text();
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

      // Check Schema.org JSON-LD address
      const jsonLdMatch = html.match(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/i);
      if (jsonLdMatch) {
        try {
          const parsed = JSON.parse(jsonLdMatch[1]);
          const addr = parsed.address || (Array.isArray(parsed) && parsed[0]?.address);
          if (addr) {
            const locality = addr.addressLocality || '';
            const region = addr.addressRegion || '';
            const country = addr.addressCountry || '';
            if (locality || region) {
              const formatted = [locality, region, country].filter(Boolean).join(', ');
              return { address: formatted, country: country || undefined };
            }
          }
        } catch {
          // JSON-LD parse failed, continue to regex
        }
      }

      // Check Canadian Postal Code (A1A 1A1)
      const canPostalMatch = text.match(/\b([A-CEGHJ-NPR-TVXY]\d[A-CEGHJ-NPR-TV-Z]\s*\d[A-CEGHJ-NPR-TV-Z]\d)\b/i);
      if (canPostalMatch) {
        const provMatch = text.match(/\b(SK|Saskatchewan|ON|Ontario|BC|British Columbia|AB|Alberta|MB|Manitoba|QC|Quebec|NS|Nova Scotia|NB|New Brunswick)\b/i);
        const prov = provMatch ? provMatch[1] : 'Canada';
        return { address: `${prov} (${canPostalMatch[1].toUpperCase()})`, country: 'Canada' };
      }

      // Check US ZIP Code with state abbreviation e.g. "Denver, CO 80202" or "TX 78701"
      const usZipMatch = text.match(/\b([A-Z]{2})\s+(\d{5}(-\d{4})?)\b/);
      if (usZipMatch) {
        return { address: `${usZipMatch[1]} ${usZipMatch[2]}, USA`, country: 'USA' };
      }

      // Check UK Postcode
      const ukPostcodeMatch = text.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
      if (ukPostcodeMatch && /\b(UK|United Kingdom|England|Scotland|Wales)\b/i.test(text)) {
        return { address: `UK (${ukPostcodeMatch[1].toUpperCase()})`, country: 'United Kingdom' };
      }

      // Check Australian Postcode (e.g. NSW 2000)
      const auMatch = text.match(/\b(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s+(\d{4})\b/i);
      if (auMatch) {
        return { address: `${auMatch[1].toUpperCase()} ${auMatch[2]}, Australia`, country: 'Australia' };
      }
    } catch {
      // Best-effort crawl
    }

    return {};
  }

  /**
   * Scrapes and identifies the location of a lead based on Name, Email, and existing info.
   * If unable to find, returns "(Not identified)".
   */
  public async scrapeLeadDetails(params: {
    businessName: string;
    email?: string;
    phone?: string;
    existingWebsite?: string;
    existingNotes?: string;
    existingMetadata?: any;
  }): Promise<LeadScrapeResult> {
    const { businessName, email = '', phone = '', existingWebsite = '', existingNotes = '', existingMetadata = {} } = params;
    const cleanName = (businessName || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPhone = (phone || '').replace(/[^\d+]/g, '');
    let cleanExistingWeb = cleanSiteUrl(existingWebsite);
    if (!cleanExistingWeb && existingMetadata?.google_profile?.website) {
      cleanExistingWeb = cleanSiteUrl(existingMetadata.google_profile.website);
    }

    let siteUrl: string | undefined = cleanExistingWeb || undefined;
    let country: string | undefined = undefined;

    // 1. Analyze Email Domain
    let emailDomain = '';
    if (cleanEmail && cleanEmail.includes('@')) {
      const parts = cleanEmail.split('@');
      emailDomain = parts[1]?.toLowerCase().trim() || '';

      if (emailDomain && !COMMON_FREE_EMAIL_DOMAINS.has(emailDomain)) {
        // Corporate email domain found! This gives us the genuine website URL
        if (!siteUrl) {
          siteUrl = `https://${emailDomain}`;
        }

        // TLD-based country resolution
        if (emailDomain.endsWith('.ca')) country = 'Canada';
        else if (emailDomain.endsWith('.co.uk') || emailDomain.endsWith('.uk')) country = 'United Kingdom';
        else if (emailDomain.endsWith('.com.au') || emailDomain.endsWith('.au')) country = 'Australia';
        else if (emailDomain.endsWith('.in') || emailDomain.endsWith('.co.in')) country = 'India';
        else if (emailDomain.endsWith('.de')) country = 'Germany';
        else if (emailDomain.endsWith('.nz')) country = 'New Zealand';
        else if (emailDomain.endsWith('.sg')) country = 'Singapore';

        // Check if domain name itself has city/location tokens
        for (const { regex, location: locName, country: cName } of KNOWN_CITY_REGEX) {
          if (regex.test(emailDomain)) {
            return {
              location: locName,
              identified: true,
              country: cName,
              siteUrl,
              source: 'email_domain',
              details: `Derived from corporate domain: ${emailDomain}`,
            };
          }
        }
      }
    }

    // 2. Check Existing Notes (e.g., "Location: Regina, SK" from CSV import)
    if (existingNotes) {
      const locMatch = existingNotes.match(/Location:\s*([^|\r\n]+)/i);
      if (locMatch && locMatch[1].trim() && !locMatch[1].toLowerCase().includes('not identified')) {
        const loc = locMatch[1].trim();
        const c = /canada|\b(SK|BC|AB|ON|MB|QC|NS|NB|PE|NL)\b/i.test(loc)
          ? 'Canada'
          : /usa|united states|\b(CO|TX|CA|NY|FL|IL|WA|GA)\b/i.test(loc)
          ? 'USA'
          : country;
        return {
          location: loc,
          identified: true,
          country: c,
          siteUrl,
          source: 'notes',
          details: 'Found in lead import notes',
        };
      }
    }

    // 3. Check Google Profile formattedAddress if present and genuine
    const gp = existingMetadata?.google_profile;
    if (gp?.formattedAddress && !gp.formattedAddress.includes('Local Business District')) {
      const addr = gp.formattedAddress.trim();
      if (addr && addr.length > 5) {
        const c = /canada/i.test(addr)
          ? 'Canada'
          : /usa|united states/i.test(addr)
          ? 'USA'
          : /india/i.test(addr)
          ? 'India'
          : /australia/i.test(addr)
          ? 'Australia'
          : /uk|united kingdom/i.test(addr)
          ? 'United Kingdom'
          : country;
        return {
          location: addr,
          identified: true,
          country: c,
          siteUrl: siteUrl || cleanSiteUrl(gp.website) || undefined,
          source: 'notes',
          details: 'Verified Google Business Profile address',
        };
      }
    }

    // 4. Check Business Name for explicit city/metro keywords
    for (const { regex, location: locName, country: cName } of KNOWN_CITY_REGEX) {
      if (regex.test(cleanName)) {
        return {
          location: locName,
          identified: true,
          country: cName,
          siteUrl,
          source: 'business_name',
          details: `Detected in business name: "${cleanName}"`,
        };
      }
    }

    // 5. Check Phone Area Code
    if (cleanPhone) {
      // Check international country codes first
      if (cleanPhone.startsWith('+91')) {
        return {
          location: 'India',
          identified: true,
          country: 'India',
          siteUrl,
          source: 'area_code',
          details: 'Identified via India country code (+91)',
        };
      }
      if (cleanPhone.startsWith('+44')) {
        return {
          location: 'United Kingdom',
          identified: true,
          country: 'United Kingdom',
          siteUrl,
          source: 'area_code',
          details: 'Identified via UK country code (+44)',
        };
      }
      if (cleanPhone.startsWith('+61')) {
        return {
          location: 'Australia',
          identified: true,
          country: 'Australia',
          siteUrl,
          source: 'area_code',
          details: 'Identified via Australia country code (+61)',
        };
      }

      // Check North American (+1 or 10-digit) area codes
      let areaCode = '';
      if (cleanPhone.startsWith('+1') && cleanPhone.length >= 5) {
        areaCode = cleanPhone.substring(2, 5);
      } else if (!cleanPhone.startsWith('+')) {
        const digits = cleanPhone.replace(/\D/g, '');
        if (digits.length === 11 && digits.startsWith('1')) {
          areaCode = digits.substring(1, 4);
        } else if (digits.length === 10) {
          areaCode = digits.substring(0, 3);
        }
      }

      if (areaCode && NORTH_AMERICAN_AREA_CODES[areaCode]) {
        const match = NORTH_AMERICAN_AREA_CODES[areaCode];
        return {
          location: `${match.city}, ${match.state}`,
          identified: true,
          country: match.country,
          siteUrl,
          source: 'area_code',
          details: `Identified via telephone area code (${areaCode})`,
        };
      }
    }

    // 6. Live Web Crawl of corporate site (if we have a genuine siteUrl)
    if (siteUrl) {
      const siteAddress = await this.crawlSiteForAddress(siteUrl);
      if (siteAddress.address) {
        return {
          location: siteAddress.address,
          identified: true,
          country: siteAddress.country || country,
          siteUrl,
          source: 'website_crawl',
          details: `Extracted from live website: ${siteUrl}`,
        };
      }
    }

    // 7. If country is known from email TLD or notes, provide country location
    if (country) {
      return {
        location: country,
        identified: true,
        country,
        siteUrl,
        source: 'email_domain',
        details: `Identified country from domain extension: ${emailDomain}`,
      };
    }

    // 8. Fallback: "(Not identified)" as specifically requested
    return {
      location: '(Not identified)',
      identified: false,
      country: undefined,
      siteUrl,
      source: 'none',
      details: 'No location cues found across name, email, phone, or website',
    };
  }

  /**
   * Scrapes and saves location and cleaned website for a single lead
   */
  public async scrapeSingleLead(leadId: string): Promise<{
    leadId: string;
    businessName: string;
    location: string;
    siteUrl?: string;
    country?: string;
    identified: boolean;
  }> {
    const leadRes = await query<{
      id: string;
      business_name: string;
      email: string;
      phone: string;
      website: string;
      notes: string;
      metadata: any;
      country: string;
      location?: string;
    }>(
      `SELECT id, business_name, email, phone, website, notes, metadata, country, location
       FROM leads WHERE id = $1`,
      [leadId]
    );

    if (leadRes.rows.length === 0) {
      throw new Error(`Lead with ID ${leadId} not found`);
    }

    const lead = leadRes.rows[0];
    const scraped = await this.scrapeLeadDetails({
      businessName: lead.business_name,
      email: lead.email,
      phone: lead.phone,
      existingWebsite: lead.website,
      existingNotes: lead.notes,
      existingMetadata: lead.metadata,
    });

    const finalWebsite = cleanSiteUrl(scraped.siteUrl || lead.website || lead.metadata?.google_profile?.website);
    const finalLocation = scraped.location;
    const finalCountry = scraped.country || lead.country || '';

    // Update metadata with location details
    const updatedMetadata = {
      ...(lead.metadata || {}),
      location: finalLocation,
      location_identified: scraped.identified,
      location_source: scraped.source,
      location_scraped_at: new Date().toISOString(),
    };

    await query(
      `UPDATE leads
       SET location = $1,
           website = $2,
           country = CASE WHEN $3 != '' THEN $3 ELSE country END,
           metadata = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [finalLocation, finalWebsite, finalCountry, JSON.stringify(updatedMetadata), leadId]
    );

    return {
      leadId,
      businessName: lead.business_name,
      location: finalLocation,
      siteUrl: finalWebsite || undefined,
      country: finalCountry || undefined,
      identified: scraped.identified,
    };
  }

  /**
   * Gradually processes all leads in the background with rate-limiting
   * to check and scrape their location without freezing the server.
   */
  public async startGradualLocationScrape(options: {
    delayMs?: number;
    recheckUnidentified?: boolean;
    overwriteIdentified?: boolean;
    batchSize?: number;
  } = {}): Promise<{ total: number; message: string }> {
    if (this.progress.isRunning) {
      return { total: this.progress.total, message: 'Gradual location scraping is already running in background.' };
    }

    const delayMs = options.delayMs ?? 1200; // 1.2s delay between leads for safe gradual processing
    const recheck = options.recheckUnidentified ?? true;

    // Fetch leads needing location check
    const querySql = recheck
      ? `SELECT id, business_name, email, phone, website, notes, metadata, country, location
         FROM leads
         WHERE deleted_at IS NULL
         ORDER BY (location = '' OR location IS NULL OR location = '(Not identified)') DESC, created_at DESC`
      : `SELECT id, business_name, email, phone, website, notes, metadata, country, location
         FROM leads
         WHERE deleted_at IS NULL AND (location = '' OR location IS NULL)
         ORDER BY created_at DESC`;

    const leadsRes = await query<{
      id: string;
      business_name: string;
      email: string;
      phone: string;
      website: string;
      notes: string;
      metadata: any;
      country: string;
      location?: string;
    }>(querySql);

    const leads = leadsRes.rows;
    if (leads.length === 0) {
      return { total: 0, message: 'No leads found to process.' };
    }

    this.progress = {
      isRunning: true,
      total: leads.length,
      processed: 0,
      identifiedCount: 0,
      unidentifiedCount: 0,
      lastRunAt: new Date().toISOString(),
      message: `Gradually scraping locations for ${leads.length} lead(s)...`,
    };

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Run async in background without blocking response
    (async () => {
      console.log(`[LeadScraperService] Starting gradual background location scrape for ${leads.length} leads...`);

      for (let i = 0; i < leads.length; i++) {
        if (signal.aborted) {
          console.log('[LeadScraperService] Scraping stopped via abort signal');
          break;
        }

        const lead = leads[i];
        this.progress.currentLeadName = lead.business_name;

        try {
          const scraped = await this.scrapeLeadDetails({
            businessName: lead.business_name,
            email: lead.email,
            phone: lead.phone,
            existingWebsite: lead.website,
            existingNotes: lead.notes,
            existingMetadata: lead.metadata,
          });

          const finalWebsite = cleanSiteUrl(scraped.siteUrl || lead.website || lead.metadata?.google_profile?.website);
          const finalLocation = scraped.location;
          const finalCountry = scraped.country || lead.country || '';

          const updatedMetadata = {
            ...(lead.metadata || {}),
            location: finalLocation,
            location_identified: scraped.identified,
            location_source: scraped.source,
            location_scraped_at: new Date().toISOString(),
          };

          await query(
            `UPDATE leads
             SET location = $1,
                 website = $2,
                 country = CASE WHEN $3 != '' THEN $3 ELSE country END,
                 metadata = $4,
                 updated_at = NOW()
             WHERE id = $5`,
            [finalLocation, finalWebsite, finalCountry, JSON.stringify(updatedMetadata), lead.id]
          );

          if (scraped.identified) {
            this.progress.identifiedCount++;
          } else {
            this.progress.unidentifiedCount++;
          }
        } catch (err: any) {
          console.warn(`[LeadScraperService] Error identifying location for ${lead.business_name}:`, err.message);
          this.progress.unidentifiedCount++;
        }

        this.progress.processed++;

        // Gentle gradual delay between leads
        if (i < leads.length - 1 && !signal.aborted) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      this.progress.isRunning = false;
      this.progress.currentLeadName = undefined;
      this.progress.message = `Completed: identified ${this.progress.identifiedCount}, not identified ${this.progress.unidentifiedCount}.`;
      console.log(`[LeadScraperService] Gradual scrape finished. Identified: ${this.progress.identifiedCount}, Not identified: ${this.progress.unidentifiedCount}`);
    })();

    return {
      total: leads.length,
      message: `Started gradual background location scraper for ${leads.length} leads.`,
    };
  }
}

export const leadScraperService = new LeadScraperService();

import { query } from '../config/db';
import { cleanSiteUrl } from './leadScraperService';
import { whatsappValidator } from './whatsappValidator';

export interface EnrichmentRunResult {
  totalLeadsScanned: number;
  emailsDiscoveredCount: number;
  socialsDiscoveredCount: number;
  locationsResolvedCount: number;
  phoneNormalizedCount: number;
  details: Array<{
    leadId: string;
    businessName: string;
    discoveredEmail?: string;
    discoveredSocials?: Record<string, string>;
    location?: string;
  }>;
}

export class AutonomousLeadEnricher {
  private isRunning = false;
  private readonly TIMEOUT_MS = 8000;
  private readonly USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  /**
   * Helper sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Fetches webpage HTML with strict timeout
   */
  private async fetchPage(url: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  /**
   * Extracts clean corporate emails from HTML text and mailto links
   */
  private extractEmailsFromHtml(html: string): string[] {
    const emails = new Set<string>();

    // 1. Mailto links
    const mailtoRegex = /href=["']mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})[^"']*["']/gi;
    let match: RegExpExecArray | null;
    while ((match = mailtoRegex.exec(html)) !== null) {
      const email = match[1].toLowerCase().trim();
      emails.add(email);
    }

    // 2. Generic email pattern in text
    const textEmailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
    const allMatches = html.match(textEmailRegex) || [];
    for (const raw of allMatches) {
      const email = raw.toLowerCase().trim();
      // Filter out static assets and noise
      if (
        !email.endsWith('.png') &&
        !email.endsWith('.jpg') &&
        !email.endsWith('.jpeg') &&
        !email.endsWith('.gif') &&
        !email.endsWith('.webp') &&
        !email.endsWith('.svg') &&
        !email.includes('sentry') &&
        !email.includes('wixpress') &&
        !email.includes('example.com') &&
        !email.includes('domain.com') &&
        !email.includes('schema.org') &&
        !email.includes('wordpress') &&
        !email.includes('cloudflare')
      ) {
        emails.add(email);
      }
    }

    const list = Array.from(emails);
    // Prioritize high-value corporate prefixes
    list.sort((a, b) => {
      const isPriority = (e: string) => /^(info|contact|sales|hello|support|admin|office|team)@/i.test(e);
      if (isPriority(a) && !isPriority(b)) return -1;
      if (!isPriority(a) && isPriority(b)) return 1;
      return 0;
    });

    return list;
  }

  /**
   * Extracts social links (Instagram, Facebook, LinkedIn) from HTML
   */
  private extractSocialsFromHtml(html: string): { instagram?: string; facebook?: string; linkedin?: string } {
    const socials: { instagram?: string; facebook?: string; linkedin?: string } = {};

    // Instagram
    const igMatch = html.match(/https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)\/?/i);
    if (igMatch && igMatch[1] && !['p', 'explore', 'stories', 'reel'].includes(igMatch[1])) {
      socials.instagram = `@${igMatch[1]}`;
    }

    // Facebook
    const fbMatch = html.match(/https?:\/\/(?:www\.)?facebook\.com\/([a-zA-Z0-9_.-]+)\/?/i);
    if (fbMatch && fbMatch[1] && !['sharer', 'share', 'login', 'groups'].includes(fbMatch[1])) {
      socials.facebook = fbMatch[1];
    }

    // LinkedIn
    const liMatch = html.match(/https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/([a-zA-Z0-9_-]+)\/?/i);
    if (liMatch && liMatch[1]) {
      socials.linkedin = `https://linkedin.com/company/${liMatch[1]}`;
    }

    return socials;
  }

  /**
   * Runs the autonomous enrichment pipeline across leads missing email or location
   */
  async runEnrichmentCycle(limit: number = 30): Promise<EnrichmentRunResult> {
    if (this.isRunning) {
      console.log('[AutonomousLeadEnricher] Enrichment cycle already running. Skipping.');
      return {
        totalLeadsScanned: 0,
        emailsDiscoveredCount: 0,
        socialsDiscoveredCount: 0,
        locationsResolvedCount: 0,
        phoneNormalizedCount: 0,
        details: [],
      };
    }

    this.isRunning = true;
    console.log(`[AutonomousLeadEnricher] Starting autonomous lead enrichment cycle (limit: ${limit})...`);

    const result: EnrichmentRunResult = {
      totalLeadsScanned: 0,
      emailsDiscoveredCount: 0,
      socialsDiscoveredCount: 0,
      locationsResolvedCount: 0,
      phoneNormalizedCount: 0,
      details: [],
    };

    try {
      // Find leads needing enrichment:
      // 1. Missing email but have website or GMB website
      // 2. Missing location or (Not identified)
      const leadsRes = await query<{
        id: string;
        business_name: string;
        email: string;
        phone: string;
        whatsapp: string;
        website: string;
        location: string;
        country: string;
        notes: string;
        metadata: any;
      }>(
        `SELECT id, business_name, email, phone, whatsapp, website, location, country, notes, metadata
         FROM leads
         WHERE deleted_at IS NULL
           AND (
             (email IS NULL OR TRIM(email) = '')
             OR (location IS NULL OR TRIM(location) = '' OR location ILIKE '%not identified%')
             OR (country IS NULL OR TRIM(country) = '')
           )
         ORDER BY 
           CASE WHEN (email IS NULL OR TRIM(email) = '') AND (website IS NOT NULL AND TRIM(website) != '') THEN 0 ELSE 1 END,
           created_at DESC
         LIMIT $1`,
        [limit]
      );

      result.totalLeadsScanned = leadsRes.rows.length;
      console.log(`[AutonomousLeadEnricher] Found ${leadsRes.rows.length} leads requiring contact/location discovery.`);

      for (const lead of leadsRes.rows) {
        const leadDetail: EnrichmentRunResult['details'][0] = {
          leadId: lead.id,
          businessName: lead.business_name,
        };

        let leadUpdated = false;
        let targetEmail = lead.email ? lead.email.trim() : '';
        let targetLocation = lead.location ? lead.location.trim() : '';
        let targetCountry = lead.country ? lead.country.trim() : '';
        let targetPhone = lead.phone ? lead.phone.trim() : '';
        let discoveredSocials = lead.metadata?.discovered_socials || {};

        // 1. Resolve Website URL
        const rawWeb = lead.website || lead.metadata?.google_profile?.website || '';
        const siteUrl = cleanSiteUrl(rawWeb);

        // 2. Crawl website if lead is missing email and website exists
        if ((!targetEmail || targetEmail === '') && siteUrl) {
          try {
            console.log(`[AutonomousLeadEnricher] Crawling site for ${lead.business_name}: ${siteUrl}`);
            const homeHtml = await this.fetchPage(siteUrl);

            let discoveredEmails: string[] = [];
            if (homeHtml) {
              discoveredEmails = this.extractEmailsFromHtml(homeHtml);
              const socials = this.extractSocialsFromHtml(homeHtml);
              if (Object.keys(socials).length > 0) {
                discoveredSocials = { ...discoveredSocials, ...socials };
                result.socialsDiscoveredCount++;
              }

              // If no email on home, check /contact or /about
              if (discoveredEmails.length === 0) {
                const contactUrl = new URL('/contact', siteUrl).toString();
                const contactHtml = await this.fetchPage(contactUrl);
                if (contactHtml) {
                  discoveredEmails = this.extractEmailsFromHtml(contactHtml);
                }
              }
            }

            if (discoveredEmails.length > 0) {
              targetEmail = discoveredEmails[0];
              leadDetail.discoveredEmail = targetEmail;
              result.emailsDiscoveredCount++;
              leadUpdated = true;
              console.log(`[AutonomousLeadEnricher] 🎯 Discovered email "${targetEmail}" for ${lead.business_name}!`);
            }
          } catch (crawlErr) {
            // Silently continue
          }
        }

        // 3. Normalize phone & WhatsApp with international country code
        const rawPhone = lead.whatsapp || lead.phone || '';
        if (rawPhone) {
          const evalRes = whatsappValidator.evaluate({ phone: rawPhone, whatsapp: rawPhone });
          if (evalRes.cleanNumber && evalRes.cleanNumber !== rawPhone) {
            targetPhone = evalRes.cleanNumber;
            result.phoneNormalizedCount++;
            leadUpdated = true;
          }
        }

        // 4. Resolve Location & Country from GMB address or area code
        if (!targetLocation || targetLocation.toLowerCase().includes('not identified') || !targetCountry) {
          const gmbAddress = lead.metadata?.google_profile?.address || '';
          if (gmbAddress) {
            targetLocation = gmbAddress;
            if (/usa|united states|\b(ca|ny|tx|fl|il|pa|oh|ga|nc|mi)\b/i.test(gmbAddress)) {
              targetCountry = 'USA';
            } else if (/canada|\b(ab|bc|mb|nb|nl|ns|on|pe|qc|sk)\b/i.test(gmbAddress)) {
              targetCountry = 'Canada';
            } else if (/india/i.test(gmbAddress)) {
              targetCountry = 'India';
            } else if (/uk|united kingdom/i.test(gmbAddress)) {
              targetCountry = 'United Kingdom';
            } else if (/australia/i.test(gmbAddress)) {
              targetCountry = 'Australia';
            }
            result.locationsResolvedCount++;
            leadDetail.location = targetLocation;
            leadUpdated = true;
          }
        }

        // 5. Commit discovered updates to PostgreSQL
        if (leadUpdated) {
          await query(
            `UPDATE leads
             SET email = COALESCE(NULLIF($1, ''), email),
                 phone = COALESCE(NULLIF($2, ''), phone),
                 location = COALESCE(NULLIF($3, ''), location),
                 country = COALESCE(NULLIF($4, ''), country),
                 metadata = jsonb_set(
                   COALESCE(metadata, '{}'::jsonb),
                   '{discovered_socials}',
                   $5::jsonb,
                   true
                 ),
                 last_enriched_at = NOW(),
                 updated_at = NOW()
             WHERE id = $6`,
            [
              targetEmail,
              targetPhone,
              targetLocation,
              targetCountry,
              JSON.stringify(discoveredSocials),
              lead.id,
            ]
          );
        }

        result.details.push(leadDetail);
        // Anti-ban polite pause between crawls
        await this.sleep(400);
      }

      console.log(
        `[AutonomousLeadEnricher] Cycle completed: ${result.emailsDiscoveredCount} emails discovered, ${result.locationsResolvedCount} locations resolved, ${result.socialsDiscoveredCount} socials found.`
      );
    } catch (err) {
      console.error('[AutonomousLeadEnricher] Enrichment cycle error:', err);
    } finally {
      this.isRunning = false;
    }

    return result;
  }
}

export const autonomousLeadEnricher = new AutonomousLeadEnricher();

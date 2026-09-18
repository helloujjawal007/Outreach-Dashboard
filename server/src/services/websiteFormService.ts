import { query } from '../config/db';

export interface DetectedContactForm {
  hasForm: boolean;
  formUrl?: string;
  actionUrl?: string;
  method?: 'POST' | 'GET';
  formType?: 'standard_form' | 'contact_form_7' | 'wpforms' | 'gravity' | 'mailto' | 'generic';
  fields?: {
    name?: string;
    email?: string;
    phone?: string;
    subject?: string;
    message?: string;
    hidden?: Record<string, string>;
  };
  reason?: string;
}

export interface FormSubmissionPayload {
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
  subject?: string;
  message: string;
}

export interface FormSubmissionResult {
  success: boolean;
  skipped: boolean;
  leadId: string;
  businessName: string;
  websiteUrl?: string;
  formUrl?: string;
  reason?: string;
  directLauncherUrl?: string;
  status: 'sent' | 'skipped' | 'failed';
}

export class WebsiteFormService {
  private readonly TIMEOUT_MS = 12000;
  private readonly USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  /**
   * Cleans and normalizes URL to valid HTTP/HTTPS
   */
  public normalizeUrl(rawUrl: string): string {
    if (!rawUrl) return '';
    let url = rawUrl.trim();
    if (url.includes('google.com/maps') || url.includes('maps.google.com')) return '';
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    try {
      const parsed = new URL(url);
      return parsed.toString();
    } catch {
      return url;
    }
  }

  public getOrigin(rawUrl: string): string {
    try {
      const parsed = new URL(rawUrl);
      return parsed.origin;
    } catch {
      return rawUrl;
    }
  }

  /**
   * Resolves the real external business website for a lead by checking:
   * 1. lead.website (if not a google maps link)
   * 2. lead.metadata.google_profile.website (if not a google maps link)
   * 3. lead.notes for "Website: ..."
   */
  public resolveLeadWebsite(lead: {
    website?: string | null;
    metadata?: any;
    notes?: string | null;
  }): string {
    const isMapsUrl = (u: string) => /google\.com\/maps|maps\.google\.com/i.test(u || '');

    // 1. Direct lead.website
    if (lead.website && !isMapsUrl(lead.website)) {
      return lead.website.trim();
    }

    // 2. GMB Google Business Profile website
    const gpWeb = lead.metadata?.google_profile?.website;
    if (gpWeb && !isMapsUrl(gpWeb)) {
      return gpWeb.trim();
    }

    // 3. Notes match
    const webMatch = (lead.notes || '').match(/Website:\s*([^\s|]+)/i);
    if (webMatch && !isMapsUrl(webMatch[1])) {
      return webMatch[1].trim();
    }

    return '';
  }

  /**
   * Helper to fetch HTML with timeout and User-Agent
   */
  private async fetchHtml(url: string): Promise<{ html: string; finalUrl: string } | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });

      clearTimeout(timeoutId);
      if (!resp.ok) return null;

      const html = await resp.text();
      return { html, finalUrl: resp.url || url };
    } catch {
      return null;
    }
  }

  /**
   * Parses HTML looking for contact forms and extracts input names
   */
  private parseFormFromHtml(html: string, pageUrl: string): DetectedContactForm | null {
    // Regex extract forms
    const formRegex = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
    let match: RegExpExecArray | null;

    while ((match = formRegex.exec(html)) !== null) {
      const formAttrs = match[1];
      const formContent = match[2];

      // Check if this form is a search form or login form -> skip
      if (/class=["'][^"']*\b(search|search-form|login|admin)\b[^"']*["']/i.test(formAttrs)) {
        continue;
      }
      if (/id=["'][^"']*\b(search|search-form|login)\b[^"']*["']/i.test(formAttrs)) {
        continue;
      }

      // Check if this form contains textarea or message / comment / email fields
      const hasTextarea = /<textarea\b/i.test(formContent);
      const hasMessageField = /name=["'][^"']*(message|comment|inquiry|body|details|note|quote|desc)[^"']*["']/i.test(
        formContent
      );
      const hasEmailField = /name=["'][^"']*(email|mail)[^"']*["']/i.test(formContent);

      if (!hasTextarea && !hasMessageField && !hasEmailField) {
        continue; // Not a contact/outreach form
      }

      // Extract action and method
      const actionMatch = formAttrs.match(/action=["']([^"']*)["']/i);
      const methodMatch = formAttrs.match(/method=["']([^"']*)["']/i);
      const method = (methodMatch ? methodMatch[1].toUpperCase() : 'POST') as 'POST' | 'GET';

      let actionUrl = pageUrl;
      if (actionMatch && actionMatch[1].trim()) {
        const rawAction = actionMatch[1].trim();
        try {
          actionUrl = new URL(rawAction, pageUrl).toString();
        } catch {
          actionUrl = rawAction;
        }
      }

      // Extract input fields
      const nameFieldMatch = formContent.match(
        /<input\b[^>]*name=["']([^"']*(?:name|fullname|author|user|contact_name)[^"']*)["'][^>]*>/i
      );
      const emailFieldMatch = formContent.match(
        /<input\b[^>]*name=["']([^"']*(?:email|mail)[^"']*)["'][^>]*>/i
      );
      const phoneFieldMatch = formContent.match(
        /<input\b[^>]*name=["']([^"']*(?:phone|tel|mobile)[^"']*)["'][^>]*>/i
      );
      const subjectFieldMatch = formContent.match(
        /<input\b[^>]*name=["']([^"']*(?:subject|topic|title)[^"']*)["'][^>]*>/i
      );
      const textareaMatch = formContent.match(
        /<textarea\b[^>]*name=["']([^"']+)["'][^>]*>/i
      );

      // Extract hidden fields (e.g. CSRF, form identifiers)
      const hiddenFields: Record<string, string> = {};
      const hiddenRegex = /<input\b[^>]*type=["']hidden["'][^>]*>/gi;
      let hiddenMatch: RegExpExecArray | null;
      while ((hiddenMatch = hiddenRegex.exec(formContent)) !== null) {
        const hTag = hiddenMatch[0];
        const hName = hTag.match(/name=["']([^"']+)["']/i);
        const hVal = hTag.match(/value=["']([^"']*)["']/i);
        if (hName) {
          hiddenFields[hName[1]] = hVal ? hVal[1] : '';
        }
      }

      return {
        hasForm: true,
        formUrl: pageUrl,
        actionUrl,
        method,
        formType: /wpcf7|contact-form-7/i.test(formContent)
          ? 'contact_form_7'
          : /wpforms/i.test(formContent)
          ? 'wpforms'
          : /gform_/i.test(formContent)
          ? 'gravity'
          : 'standard_form',
        fields: {
          name: nameFieldMatch ? nameFieldMatch[1] : 'name',
          email: emailFieldMatch ? emailFieldMatch[1] : 'email',
          phone: phoneFieldMatch ? phoneFieldMatch[1] : 'phone',
          subject: subjectFieldMatch ? subjectFieldMatch[1] : 'subject',
          message: textareaMatch ? textareaMatch[1] : 'message',
          hidden: hiddenFields,
        },
      };
    }

    return null;
  }

  /**
   * Detects whether a website has a contact form and returns form metadata
   */
  public async detectContactForm(websiteUrl: string): Promise<DetectedContactForm> {
    const norm = this.normalizeUrl(websiteUrl);
    if (!norm) {
      return { hasForm: false, reason: 'No valid website URL' };
    }
    const origin = this.getOrigin(norm);

    // 1. If websiteUrl already has a specific path (e.g. /contact), try it first
    if (norm !== origin) {
      const directResult = await this.fetchHtml(norm);
      if (directResult) {
        const form = this.parseFormFromHtml(directResult.html, directResult.finalUrl);
        if (form) return form;
      }
    }

    // 2. Try homepage
    const homeResult = await this.fetchHtml(origin);
    if (homeResult) {
      const homeForm = this.parseFormFromHtml(homeResult.html, homeResult.finalUrl);
      if (homeForm) {
        return homeForm;
      }

      // Look for contact page link in homepage HTML
      const contactLinkMatch = homeResult.html.match(
        /href=["']([^"']*(?:contact|get-in-touch|reach-us|contact-us|request-a-quote|quote|inquiry|book)[^"']*)["']/i
      );
      if (contactLinkMatch) {
        try {
          const contactPageUrl = new URL(contactLinkMatch[1], homeResult.finalUrl).toString();
          const contactResult = await this.fetchHtml(contactPageUrl);
          if (contactResult) {
            const contactForm = this.parseFormFromHtml(contactResult.html, contactResult.finalUrl);
            if (contactForm) {
              return contactForm;
            }
          }
        } catch {}
      }
    }

    // 3. Try common standard contact endpoints
    const candidatePaths = ['/contact', '/contact-us', '/contactus', '/get-in-touch', '/reach-us', '/request-quote', '/inquiry'];
    for (const path of candidatePaths) {
      try {
        const candidateUrl = new URL(path, origin).toString();
        const candResult = await this.fetchHtml(candidateUrl);
        if (candResult) {
          const candForm = this.parseFormFromHtml(candResult.html, candResult.finalUrl);
          if (candForm) {
            return candForm;
          }
        }
      } catch {}
    }

    return {
      hasForm: false,
      formUrl: `${origin}/contact`,
      reason: 'No contact form found on website pages',
    };
  }

  /**
   * Detects whether a lead's website has a contact form and persists the result to PostgreSQL.
   */
  public async detectAndSaveFormForLead(
    leadId: string,
    customWebsiteUrl?: string
  ): Promise<{
    success: boolean;
    detection: DetectedContactForm;
    lead?: any;
    error?: string;
  }> {
    const leadRes = await query<{
      id: string;
      business_name: string;
      website: string | null;
      metadata: any;
      notes: string | null;
      detected_channels: string[] | null;
    }>(`SELECT id, business_name, website, metadata, notes, detected_channels FROM leads WHERE id = $1`, [leadId]);

    if (leadRes.rows.length === 0) {
      return {
        success: false,
        detection: { hasForm: false, reason: 'Lead not found in database' },
        error: 'Lead not found',
      };
    }

    const lead = leadRes.rows[0];
    const isMapsUrl = (u: string) => /google\.com\/maps|maps\.google\.com/i.test(u || '');

    let targetWebsite = (customWebsiteUrl && !isMapsUrl(customWebsiteUrl))
      ? customWebsiteUrl.trim()
      : this.resolveLeadWebsite(lead);

    if (!targetWebsite) {
      const detection: DetectedContactForm = {
        hasForm: false,
        reason: 'No external business website link found in GMB or lead record',
      };
      const metadata = {
        ...(lead.metadata || {}),
        website_form: { ...detection, checkedAt: new Date().toISOString() },
      };
      await query(`UPDATE leads SET metadata = $1, updated_at = NOW() WHERE id = $2`, [
        JSON.stringify(metadata),
        leadId,
      ]);
      return { success: true, detection, lead: { ...lead, metadata } };
    }

    const detection = await this.detectContactForm(targetWebsite);

    // Prepare updated metadata
    const metadata = {
      ...(lead.metadata || {}),
      website_form: {
        ...detection,
        websiteUrl: targetWebsite,
        checkedAt: new Date().toISOString(),
      },
    };

    // Update detected_channels
    const channels = new Set<string>(lead.detected_channels || []);
    if (detection.hasForm) {
      channels.add('website_form');
    } else {
      channels.delete('website_form');
    }
    const updatedChannels = Array.from(channels);

    // If lead.website was empty or maps URL, update lead.website with the real business website!
    const shouldUpdateWebsite = !lead.website || isMapsUrl(lead.website);
    const newWebsite = shouldUpdateWebsite ? targetWebsite : lead.website;

    const updatedRes = await query(
      `UPDATE leads 
       SET website = $1, 
           metadata = $2, 
           detected_channels = $3, 
           updated_at = NOW() 
       WHERE id = $4
       RETURNING *`,
      [newWebsite, JSON.stringify(metadata), JSON.stringify(updatedChannels), leadId]
    );

    return {
      success: true,
      detection,
      lead: updatedRes.rows[0],
    };
  }

  /**
   * Submits outreach message to a lead's website contact form
   */
  public async submitContactForm(
    leadId: string,
    payload: FormSubmissionPayload
  ): Promise<FormSubmissionResult> {
    const leadRes = await query<{
      id: string;
      business_name: string;
      website: string;
      metadata: any;
      notes: string;
      email: string;
      phone: string;
    }>(`SELECT id, business_name, website, metadata, notes, email, phone FROM leads WHERE id = $1`, [leadId]);

    if (leadRes.rows.length === 0) {
      return {
        success: false,
        skipped: true,
        leadId,
        businessName: 'Unknown',
        status: 'failed',
        reason: 'Lead not found in database',
      };
    }

    const lead = leadRes.rows[0];
    const businessName = lead.business_name;

    // Resolve website
    const website = this.resolveLeadWebsite(lead);
    const normalizedWeb = this.normalizeUrl(website);

    if (!normalizedWeb) {
      return {
        success: false,
        skipped: true,
        leadId,
        businessName,
        status: 'skipped',
        reason: 'No website URL available for this lead (skipped)',
      };
    }

    // Check if form metadata is already cached and valid in lead.metadata.website_form
    let detection: DetectedContactForm | null = null;
    const cachedForm = lead.metadata?.website_form;
    if (cachedForm && cachedForm.hasForm && cachedForm.actionUrl) {
      detection = cachedForm as DetectedContactForm;
    } else {
      // Detect form on site and save it
      const saved = await this.detectAndSaveFormForLead(leadId, normalizedWeb);
      detection = saved.detection;
    }

    if (!detection || !detection.hasForm || !detection.actionUrl) {
      return {
        success: false,
        skipped: true,
        leadId,
        businessName,
        websiteUrl: normalizedWeb,
        formUrl: detection?.formUrl || `${this.getOrigin(normalizedWeb)}/contact`,
        status: 'skipped',
        reason: 'No contact form found on website (skipped)',
      };
    }

    // Prepare submission parameters
    const senderName = payload.senderName || 'Online Digital Solution';
    const senderEmail = payload.senderEmail || 'team.onlinedigitalsolution@gmail.com';
    const senderPhone = payload.senderPhone || '+1 306-205-1817';
    const subject = payload.subject || `Inquiry regarding ${businessName}`;
    const message = payload.message || '';

    const fields = detection.fields || {};
    const bodyParams = new URLSearchParams();

    // Map fields
    if (fields.hidden) {
      for (const [k, v] of Object.entries(fields.hidden)) {
        bodyParams.append(k, v);
      }
    }
    bodyParams.append(fields.name || 'name', senderName);
    bodyParams.append(fields.email || 'email', senderEmail);
    bodyParams.append(fields.phone || 'phone', senderPhone);
    bodyParams.append(fields.subject || 'subject', subject);
    bodyParams.append(fields.message || 'message', message);

    // Direct prefilled link generator for user fallback / preview
    const launcherParams = new URLSearchParams({
      name: senderName,
      email: senderEmail,
      phone: senderPhone,
      subject: subject,
      message: message,
    });
    const directLauncherUrl = `${detection.formUrl || normalizedWeb}?${launcherParams.toString()}`;

    let isPostSuccessful = false;
    let postStatusText = '';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

      const postResp = await fetch(detection.actionUrl, {
        method: detection.method || 'POST',
        headers: {
          'User-Agent': this.USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: detection.formUrl || normalizedWeb,
          Origin: new URL(detection.formUrl || normalizedWeb).origin,
        },
        body: bodyParams.toString(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // If status 200 - 399, considered delivered
      if (postResp.ok || (postResp.status >= 200 && postResp.status < 400)) {
        isPostSuccessful = true;
        postStatusText = `Delivered directly to form endpoint (${postResp.status})`;
      } else {
        postStatusText = `Form endpoint returned HTTP ${postResp.status}. Pre-filled launcher prepared.`;
      }
    } catch (err: any) {
      postStatusText = `Submission request error (${err?.message || 'Network timeout'}). Pre-filled launcher prepared.`;
    }

    // Record outreach in PostgreSQL conversations and messages thread
    try {
      const convRes = await query<{ id: string }>(
        `SELECT id FROM conversations WHERE entity_type = 'lead' AND lead_id = $1 AND channel = 'website_form' LIMIT 1`,
        [leadId]
      );
      let convId: string;
      if (convRes.rows.length === 0) {
        const newConv = await query<{ id: string }>(
          `INSERT INTO conversations (entity_type, lead_id, channel, status, last_message_at)
           VALUES ('lead', $1, 'website_form', 'open', NOW())
           RETURNING id`,
          [leadId]
        );
        convId = newConv.rows[0].id;
      } else {
        convId = convRes.rows[0].id;
        await query(`UPDATE conversations SET last_message_at = NOW() WHERE id = $1`, [convId]);
      }

      await query(
        `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at, is_read, metadata)
         VALUES ($1, 'website_form', 'outbound', $2, $3, NOW(), true, $4)`,
        [
          convId,
          message,
          isPostSuccessful ? 'sent' : 'queued',
          JSON.stringify({
            formUrl: detection.formUrl,
            actionUrl: detection.actionUrl,
            formType: detection.formType,
            postStatusText,
            directLauncherUrl,
          }),
        ]
      );

      // Update lead last contacted at
      await query(`UPDATE leads SET last_contacted_at = NOW(), updated_at = NOW() WHERE id = $1`, [leadId]);
    } catch (dbErr) {
      console.error('[WebsiteFormService] Failed to record message in DB:', dbErr);
    }

    return {
      success: true,
      skipped: false,
      leadId,
      businessName,
      websiteUrl: normalizedWeb,
      formUrl: detection.formUrl,
      directLauncherUrl,
      status: 'sent',
      reason: isPostSuccessful
        ? 'Website contact form submitted successfully!'
        : 'Form submission prepared & direct launcher ready (site requires client session / captcha).',
    };
  }
}

export const websiteFormService = new WebsiteFormService();

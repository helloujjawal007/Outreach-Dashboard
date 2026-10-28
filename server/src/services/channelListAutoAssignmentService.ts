import { query } from '../config/db';
import { emailValidatorService } from './emailValidatorService';

export interface ChannelAssignmentSummary {
  addedToEmailList: number;
  addedToWhatsAppList: number;
  addedToLinkedInList: number;
  addedToInstagramList: number;
  addedToFacebookList: number;
  addedToWebsiteList: number;
  addedToCustomList: number;
}

export class ChannelListAutoAssignmentService {
  private listCache: Map<string, string> = new Map();
  private cacheLoadedAt: number = 0;

  /**
   * Loads or creates default channel lists in PostgreSQL
   */
  public async ensureChannelLists(): Promise<{
    emailListId: string;
    whatsappListId: string;
    linkedinListId: string;
    instagramListId: string;
    facebookListId: string;
    websiteListId: string;
    invalidListId: string;
  }> {
    const now = Date.now();
    // Cache for 2 minutes to minimize repeated queries
    if (this.listCache.size >= 7 && now - this.cacheLoadedAt < 120000) {
      return {
        emailListId: this.listCache.get('Email Leads') || '',
        whatsappListId: this.listCache.get('WhatsApp Leads') || '',
        linkedinListId: this.listCache.get('LinkedIn Leads') || '',
        instagramListId: this.listCache.get('Instagram Leads') || '',
        facebookListId: this.listCache.get('Facebook Leads') || '',
        websiteListId: this.listCache.get('Website Leads') || '',
        invalidListId: this.listCache.get('Invalid List') || '',
      };
    }

    const defaultLists = [
      {
        name: 'Email Leads',
        description: 'Auto-populated list of all imported leads with verified email addresses.',
      },
      {
        name: 'WhatsApp Leads',
        description: 'Auto-populated list of all imported leads with verified WhatsApp or mobile numbers.',
      },
      {
        name: 'LinkedIn Leads',
        description: 'Auto-populated list of all imported leads with LinkedIn profile or company links.',
      },
      {
        name: 'Instagram Leads',
        description: 'Auto-populated list of all imported leads with Instagram handles or profiles.',
      },
      {
        name: 'Facebook Leads',
        description: 'Auto-populated list of all imported leads with Facebook business pages.',
      },
      {
        name: 'Website Leads',
        description: 'Auto-populated list of all imported leads with active company websites.',
      },
      {
        name: 'Invalid List',
        description: 'Auto-populated list of leads with invalid, disposable, non-existent, or bounced email addresses flagged before outreach.',
      },
    ];

    for (const item of defaultLists) {
      const existing = await query<{ id: string }>(`SELECT id FROM lists WHERE name = $1 LIMIT 1`, [item.name]);
      if (existing.rows.length > 0) {
        this.listCache.set(item.name, existing.rows[0].id);
      } else {
        const created = await query<{ id: string }>(
          `INSERT INTO lists (name, description, created_at, updated_at)
           VALUES ($1, $2, NOW(), NOW())
           RETURNING id`,
          [item.name, item.description]
        );
        this.listCache.set(item.name, created.rows[0].id);
      }
    }

    this.cacheLoadedAt = now;

    return {
      emailListId: this.listCache.get('Email Leads') || '',
      whatsappListId: this.listCache.get('WhatsApp Leads') || '',
      linkedinListId: this.listCache.get('LinkedIn Leads') || '',
      instagramListId: this.listCache.get('Instagram Leads') || '',
      facebookListId: this.listCache.get('Facebook Leads') || '',
      websiteListId: this.listCache.get('Website Leads') || '',
      invalidListId: this.listCache.get('Invalid List') || '',
    };
  }

  /**
   * Automatically adds leads to their corresponding platform lists and custom list
   */
  public async autoAssignLeads(
    leads: Array<{
      id: string;
      email?: string;
      phone?: string;
      whatsapp?: string;
      linkedin?: string;
      instagram?: string;
      facebook?: string;
      website?: string;
    }>,
    customListId?: string
  ): Promise<ChannelAssignmentSummary> {
    if (!Array.isArray(leads) || leads.length === 0) {
      return {
        addedToEmailList: 0,
        addedToWhatsAppList: 0,
        addedToLinkedInList: 0,
        addedToInstagramList: 0,
        addedToFacebookList: 0,
        addedToWebsiteList: 0,
        addedToCustomList: 0,
      };
    }

    const channelLists = await this.ensureChannelLists();
    const summary: ChannelAssignmentSummary = {
      addedToEmailList: 0,
      addedToWhatsAppList: 0,
      addedToLinkedInList: 0,
      addedToInstagramList: 0,
      addedToFacebookList: 0,
      addedToWebsiteList: 0,
      addedToCustomList: 0,
    };

    for (const lead of leads) {
      const leadId = lead.id;
      if (!leadId) continue;

      // 1. Email Channel List (and Invalid List for invalid emails)
      const email = (lead.email || '').trim();
      if (email) {
        const syntax = emailValidatorService.validateSyntax(email);
        if (syntax.isValid && channelLists.emailListId) {
          const res = await query(
            `INSERT INTO lead_list_memberships (list_id, lead_id, created_at, added_at)
             VALUES ($1, $2, NOW(), NOW())
             ON CONFLICT (list_id, lead_id) DO NOTHING
             RETURNING lead_id`,
            [channelLists.emailListId, leadId]
          );
          if (res.rows.length > 0) summary.addedToEmailList++;
        } else if (!syntax.isValid) {
          await emailValidatorService.flagAndMoveLeadToInvalidList(
            leadId,
            email,
            syntax.reason || 'Invalid email format or domain',
            syntax.reason?.includes('disposable') ? 'disposable_domain' : 'invalid_syntax'
          );
        }
      }

      // 2. WhatsApp / Phone Channel List (digits >= 7)
      const phoneDigits = (lead.whatsapp || lead.phone || '').replace(/\D/g, '');
      if (phoneDigits.length >= 7 && channelLists.whatsappListId) {
        const res = await query(
          `INSERT INTO lead_list_memberships (list_id, lead_id, created_at, added_at)
           VALUES ($1, $2, NOW(), NOW())
           ON CONFLICT (list_id, lead_id) DO NOTHING
           RETURNING lead_id`,
          [channelLists.whatsappListId, leadId]
        );
        if (res.rows.length > 0) summary.addedToWhatsAppList++;
      }

      // 3. LinkedIn Channel List
      const linkedin = (lead.linkedin || '').trim();
      if (linkedin && channelLists.linkedinListId) {
        const res = await query(
          `INSERT INTO lead_list_memberships (list_id, lead_id, created_at, added_at)
           VALUES ($1, $2, NOW(), NOW())
           ON CONFLICT (list_id, lead_id) DO NOTHING
           RETURNING lead_id`,
          [channelLists.linkedinListId, leadId]
        );
        if (res.rows.length > 0) summary.addedToLinkedInList++;
      }

      // 4. Instagram Channel List
      const instagram = (lead.instagram || '').trim();
      if (instagram && channelLists.instagramListId) {
        const res = await query(
          `INSERT INTO lead_list_memberships (list_id, lead_id, created_at, added_at)
           VALUES ($1, $2, NOW(), NOW())
           ON CONFLICT (list_id, lead_id) DO NOTHING
           RETURNING lead_id`,
          [channelLists.instagramListId, leadId]
        );
        if (res.rows.length > 0) summary.addedToInstagramList++;
      }

      // 5. Facebook Channel List
      const facebook = (lead.facebook || '').trim();
      if (facebook && channelLists.facebookListId) {
        const res = await query(
          `INSERT INTO lead_list_memberships (list_id, lead_id, created_at, added_at)
           VALUES ($1, $2, NOW(), NOW())
           ON CONFLICT (list_id, lead_id) DO NOTHING
           RETURNING lead_id`,
          [channelLists.facebookListId, leadId]
        );
        if (res.rows.length > 0) summary.addedToFacebookList++;
      }

      // 6. Website Channel List
      const website = (lead.website || '').trim();
      if (
        website &&
        channelLists.websiteListId &&
        !website.includes('google.com/maps') &&
        !website.includes('maps.google')
      ) {
        const res = await query(
          `INSERT INTO lead_list_memberships (list_id, lead_id, created_at, added_at)
           VALUES ($1, $2, NOW(), NOW())
           ON CONFLICT (list_id, lead_id) DO NOTHING
           RETURNING lead_id`,
          [channelLists.websiteListId, leadId]
        );
        if (res.rows.length > 0) summary.addedToWebsiteList++;
      }

      // 7. User Custom List (if provided and valid)
      if (customListId && customListId !== 'none' && customListId !== 'all') {
        const res = await query(
          `INSERT INTO lead_list_memberships (list_id, lead_id, created_at, added_at)
           VALUES ($1, $2, NOW(), NOW())
           ON CONFLICT (list_id, lead_id) DO NOTHING
           RETURNING lead_id`,
          [customListId, leadId]
        );
        if (res.rows.length > 0) summary.addedToCustomList++;
      }
    }

    console.log(
      `[ChannelListAutoAssignment] Assigned leads: Email=${summary.addedToEmailList}, WhatsApp=${summary.addedToWhatsAppList}, LinkedIn=${summary.addedToLinkedInList}, IG=${summary.addedToInstagramList}, FB=${summary.addedToFacebookList}, Web=${summary.addedToWebsiteList}, Custom=${summary.addedToCustomList}`
    );

    return summary;
  }

  /**
   * Synchronizes a single lead into all matching channel lists
   */
  public async syncLead(leadId: string): Promise<ChannelAssignmentSummary> {
    const leadRes = await query<any>(
      `SELECT id, email, phone, whatsapp, linkedin, instagram, facebook, website FROM leads WHERE id = $1 AND deleted_at IS NULL`,
      [leadId]
    );
    if (leadRes.rows.length === 0) {
      return {
        addedToEmailList: 0,
        addedToWhatsAppList: 0,
        addedToLinkedInList: 0,
        addedToInstagramList: 0,
        addedToFacebookList: 0,
        addedToWebsiteList: 0,
        addedToCustomList: 0,
      };
    }
    return this.autoAssignLeads([leadRes.rows[0]]);
  }

  /**
   * Synchronizes all existing leads in the database into appropriate channel lists
   */
  public async syncAllExistingLeads(): Promise<ChannelAssignmentSummary> {
    const leadsRes = await query<any>(
      `SELECT id, email, phone, whatsapp, linkedin, instagram, facebook, website FROM leads WHERE deleted_at IS NULL`
    );
    return this.autoAssignLeads(leadsRes.rows);
  }
}

export const channelListAutoAssignmentService = new ChannelListAutoAssignmentService();

import { query } from '../config/db';
import { emailValidatorService } from './emailValidatorService';

export interface ChannelAssignmentSummary {
  addedToEmailList: number;
  addedToWhatsAppList: number;
  addedToLinkedInList: number;
  addedToInstagramList: number;
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
    invalidListId: string;
  }> {
    const now = Date.now();
    // Cache for 2 minutes to minimize repeated queries
    if (this.listCache.size >= 5 && now - this.cacheLoadedAt < 120000) {
      return {
        emailListId: this.listCache.get('Email Leads') || '',
        whatsappListId: this.listCache.get('WhatsApp Leads') || '',
        linkedinListId: this.listCache.get('LinkedIn Leads') || '',
        instagramListId: this.listCache.get('Instagram Leads') || '',
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
    }>,
    customListId?: string
  ): Promise<ChannelAssignmentSummary> {
    if (!Array.isArray(leads) || leads.length === 0) {
      return {
        addedToEmailList: 0,
        addedToWhatsAppList: 0,
        addedToLinkedInList: 0,
        addedToInstagramList: 0,
        addedToCustomList: 0,
      };
    }

    const channelLists = await this.ensureChannelLists();
    const summary: ChannelAssignmentSummary = {
      addedToEmailList: 0,
      addedToWhatsAppList: 0,
      addedToLinkedInList: 0,
      addedToInstagramList: 0,
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
            `INSERT INTO lead_list_memberships (list_id, lead_id, created_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT DO NOTHING
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

      // 2. WhatsApp / Phone Channel List
      const phoneDigits = (lead.whatsapp || lead.phone || '').replace(/\D/g, '');
      if (phoneDigits.length >= 7 && channelLists.whatsappListId) {
        const res = await query(
          `INSERT INTO lead_list_memberships (list_id, lead_id, created_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT DO NOTHING
           RETURNING lead_id`,
          [channelLists.whatsappListId, leadId]
        );
        if (res.rows.length > 0) summary.addedToWhatsAppList++;
      }

      // 3. LinkedIn Channel List
      const linkedin = (lead.linkedin || '').trim();
      if (linkedin && channelLists.linkedinListId) {
        const res = await query(
          `INSERT INTO lead_list_memberships (list_id, lead_id, created_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT DO NOTHING
           RETURNING lead_id`,
          [channelLists.linkedinListId, leadId]
        );
        if (res.rows.length > 0) summary.addedToLinkedInList++;
      }

      // 4. Instagram Channel List
      const instagram = (lead.instagram || '').trim();
      if (instagram && channelLists.instagramListId) {
        const res = await query(
          `INSERT INTO lead_list_memberships (list_id, lead_id, created_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT DO NOTHING
           RETURNING lead_id`,
          [channelLists.instagramListId, leadId]
        );
        if (res.rows.length > 0) summary.addedToInstagramList++;
      }

      // 5. User Custom List (if provided and valid)
      if (customListId && customListId !== 'none' && customListId !== 'all') {
        const res = await query(
          `INSERT INTO lead_list_memberships (list_id, lead_id, created_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT DO NOTHING
           RETURNING lead_id`,
          [customListId, leadId]
        );
        if (res.rows.length > 0) summary.addedToCustomList++;
      }
    }

    console.log(
      `[ChannelListAutoAssignment] Assigned leads: Email=${summary.addedToEmailList}, WhatsApp=${summary.addedToWhatsAppList}, LinkedIn=${summary.addedToLinkedInList}, IG=${summary.addedToInstagramList}, Custom=${summary.addedToCustomList}`
    );

    return summary;
  }
}

export const channelListAutoAssignmentService = new ChannelListAutoAssignmentService();

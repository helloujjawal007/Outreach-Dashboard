import { query } from '../config/db';
import crypto from 'node:crypto';

/**
 * Production-Grade CRM Seed Script
 * Generates an authentic, buzzing CRM ecosystem with 22 realistic companies,
 * primary contacts with executive titles, deals, tasks, activity logs, 
 * conversations, inbound replies, and automatic channel list assignments.
 */

interface SeedLeadInput {
  businessName: string;
  primaryContactName: string;
  category: string;
  email: string;
  phone: string;
  whatsapp: string;
  linkedin: string;
  website: string;
  instagram?: string;
  facebook?: string;
  location: string;
  country: string;
  outreachStage: string;
  status: string;
  dealValue: number;
  dealStage: 'interested' | 'audit_sent' | 'meeting_booked' | 'proposal_sent' | 'negotiation' | 'won';
  dealProbability: number;
  leadScore: number;
  notes: string;
  inboundIntent?: string;
  inboundIntentConfidence?: number;
  hasInboundReply?: boolean;
  replyText?: string;
  taskTitle?: string;
  taskPriority?: 'high' | 'medium' | 'low';
}

const SEED_LEADS: SeedLeadInput[] = [
  {
    businessName: 'CloudScale Technologies',
    primaryContactName: 'Marcus Vance (Chief Technology Officer)',
    category: 'Technology & SaaS',
    email: 'marcus.vance@cloudscaletech.com',
    phone: '+1 415-890-2341',
    whatsapp: '+1 415-890-2341',
    linkedin: 'https://linkedin.com/company/cloudscale-technologies',
    website: 'https://cloudscaletech.com',
    location: 'San Francisco, CA',
    country: 'United States',
    outreachStage: 'meeting_scheduled',
    status: 'active',
    dealValue: 48000,
    dealStage: 'meeting_booked',
    dealProbability: 60,
    leadScore: 94,
    notes: 'High-growth multi-cloud infrastructure provider. Looking for technical SEO audit & conversion funnels.',
    inboundIntent: 'meeting_requested',
    inboundIntentConfidence: 0.96,
    hasInboundReply: true,
    replyText: 'Hi Alex, we reviewed the initial benchmark report. Can we schedule a 30-min architecture review with our growth team this Thursday at 2 PM PST?',
    taskTitle: 'Prepare multi-cloud SEO technical audit presentation for Marcus (CTO)',
    taskPriority: 'high',
  },
  {
    businessName: 'Vanguard Private Wealth',
    primaryContactName: 'Sarah Jenkins (VP of Client Acquisition)',
    category: 'Financial Services',
    email: 'sarah.jenkins@vanguardwealth.co.uk',
    phone: '+44 20 7946 0912',
    whatsapp: '+44 20 7946 0912',
    linkedin: 'https://linkedin.com/company/vanguard-private-wealth',
    website: 'https://vanguardwealth.co.uk',
    location: 'London, Mayfair',
    country: 'United Kingdom',
    outreachStage: 'proposal_sent',
    status: 'active',
    dealValue: 65000,
    dealStage: 'proposal_sent',
    dealProbability: 75,
    leadScore: 92,
    notes: 'Managing £450M in HNW family assets. Needs compliance-safe WhatsApp outreach & automated inbound qualification.',
    inboundIntent: 'interested',
    inboundIntentConfidence: 0.91,
    hasInboundReply: true,
    replyText: 'We received your proposal. Our managing partners liked the compliance framework. What is the lead time for deployment once signed?',
    taskTitle: 'Send revised master service agreement with compliance addendum to Sarah',
    taskPriority: 'high',
  },
  {
    businessName: 'Aura Dermatology & Aesthetics',
    primaryContactName: 'Dr. Evelyn Reed (Managing Medical Director)',
    category: 'Healthcare & Medical',
    email: 'dr.reed@auradermclinic.com',
    phone: '+1 212-675-9014',
    whatsapp: '+1 212-675-9014',
    linkedin: 'https://linkedin.com/in/evelyn-reed-md',
    website: 'https://auradermclinic.com',
    instagram: '@auradermnyc',
    facebook: 'AuraDermNYC',
    location: 'New York, Manhattan',
    country: 'United States',
    outreachStage: 'negotiation',
    status: 'active',
    dealValue: 28500,
    dealStage: 'negotiation',
    dealProbability: 85,
    leadScore: 89,
    notes: 'Premier cosmetic dermatology clinic. Needs automated patient booking bot & Google Local SEO dominance.',
    inboundIntent: 'meeting_requested',
    inboundIntentConfidence: 0.95,
    hasInboundReply: true,
    replyText: 'The WhatsApp appointment confirmation workflow looks great. Can we do a trial across our Upper East Side clinic first?',
    taskTitle: 'Confirm clinic deployment date with Dr. Reed',
    taskPriority: 'high',
  },
  {
    businessName: 'Nexus BioLogistics',
    primaryContactName: 'David Zhao (Head of Global Operations)',
    category: 'Logistics & Supply Chain',
    email: 'd.zhao@nexusbiologistics.com.au',
    phone: '+61 2 8123 4567',
    whatsapp: '+61 2 8123 4567',
    linkedin: 'https://linkedin.com/company/nexus-biologistics',
    website: 'https://nexusbiologistics.com.au',
    location: 'Sydney, NSW',
    country: 'Australia',
    outreachStage: 'meeting_scheduled',
    status: 'active',
    dealValue: 52000,
    dealStage: 'meeting_booked',
    dealProbability: 55,
    leadScore: 86,
    notes: 'Cold-chain pharmaceutical delivery network spanning APAC. Wants real-time automated tracking updates via WhatsApp & Email.',
    inboundIntent: 'interested',
    inboundIntentConfidence: 0.88,
    hasInboundReply: true,
    replyText: 'Your demo video answered our cold-chain notification questions. Let us connect on Zoom on Wednesday morning Sydney time.',
    taskTitle: 'Send calendar invite with Zoom bridge to David Zhao',
    taskPriority: 'medium',
  },
  {
    businessName: 'Starlight Creative Agency',
    primaryContactName: 'Claire Dupont (Partner & Chief Creative Officer)',
    category: 'Media & Design',
    email: 'claire@starlightagency.la',
    phone: '+1 310-555-8832',
    whatsapp: '+1 310-555-8832',
    linkedin: 'https://linkedin.com/company/starlight-creative',
    website: 'https://starlightagency.la',
    instagram: '@starlightcreative',
    location: 'Los Angeles, CA',
    country: 'United States',
    outreachStage: 'replied',
    status: 'active',
    dealValue: 34000,
    dealStage: 'audit_sent',
    dealProbability: 40,
    leadScore: 84,
    notes: 'Top tier entertainment branding studio. Looking to automate their high-ticket lead intake and portfolio pitch decks.',
    inboundIntent: 'interested',
    inboundIntentConfidence: 0.89,
    hasInboundReply: true,
    replyText: 'Love the personalized case study you sent over. What does onboarding look like for an agency team of 25 designers?',
    taskTitle: 'Send Agency Onboarding Roadmap PDF to Claire',
    taskPriority: 'medium',
  },
  {
    businessName: 'Apex Law & Compliance LLP',
    primaryContactName: 'Thomas Sterling (Managing Partner)',
    category: 'Legal & Advisory',
    email: 'tsterling@apexlawllp.com',
    phone: '+1 312-701-4420',
    whatsapp: '+1 312-701-4420',
    linkedin: 'https://linkedin.com/company/apex-law-compliance',
    website: 'https://apexlawllp.com',
    location: 'Chicago, IL',
    country: 'United States',
    outreachStage: 'contacted',
    status: 'active',
    dealValue: 42000,
    dealStage: 'interested',
    dealProbability: 30,
    leadScore: 78,
    notes: 'Commercial litigation & corporate governance firm. Cold email opened 4 times; clicked technical whitepaper link.',
    taskTitle: 'Trigger follow-up Step 2 with case study on legal intake',
    taskPriority: 'medium',
  },
  {
    businessName: 'Veritas Cybersecurity Solutions',
    primaryContactName: 'Rachel Adams (Director of Enterprise Sales)',
    category: 'Technology & SaaS',
    email: 'rachel.adams@veritascyber.ca',
    phone: '+1 416-902-7711',
    whatsapp: '+1 416-902-7711',
    linkedin: 'https://linkedin.com/company/veritas-cybersecurity',
    website: 'https://veritascyber.ca',
    location: 'Toronto, ON',
    country: 'Canada',
    outreachStage: 'won',
    status: 'client',
    dealValue: 72000,
    dealStage: 'won',
    dealProbability: 100,
    leadScore: 98,
    notes: 'SOC-2 compliant penetration testing & managed detection. Converted into active recurring retainer client.',
    inboundIntent: 'interested',
    hasInboundReply: true,
    replyText: 'Contract is countersigned and initial invoice processed. Looking forward to kick-off call next Monday.',
    taskTitle: 'Complete client onboarding checklist and provision Slack connect channel',
    taskPriority: 'high',
  },
  {
    businessName: 'Zenith Luxury Hotels & Resorts',
    primaryContactName: 'Elena Rostova (VP of Guest Experience)',
    category: 'Hospitality & Luxury',
    email: 'elena.rostova@zenithhotels.com',
    phone: '+1 305-882-9900',
    whatsapp: '+1 305-882-9900',
    linkedin: 'https://linkedin.com/company/zenith-hotels',
    website: 'https://zenithhotels.com',
    instagram: '@zenithluxuryhotels',
    facebook: 'ZenithHotelsOfficial',
    location: 'Miami, FL',
    country: 'United States',
    outreachStage: 'negotiation',
    status: 'active',
    dealValue: 88000,
    dealStage: 'negotiation',
    dealProbability: 80,
    leadScore: 91,
    notes: 'Portfolio of 6 luxury boutique hotels. Implementing 24/7 AI VIP concierge across WhatsApp and Instagram DM.',
    inboundIntent: 'interested',
    inboundIntentConfidence: 0.94,
    hasInboundReply: true,
    replyText: 'Our regional GM reviewed the WhatsApp concierge test. Can we finalize the service agreement by end of week?',
    taskTitle: 'Review multi-property SLA agreement with legal team for Zenith',
    taskPriority: 'high',
  },
  {
    businessName: 'HyperGrowth Performance DTC',
    primaryContactName: 'Michael Chang (Founder & CEO)',
    category: 'E-Commerce & Retail',
    email: 'm.chang@hypergrowthdtc.com',
    phone: '+1 512-400-3290',
    whatsapp: '+1 512-400-3290',
    linkedin: 'https://linkedin.com/in/michael-chang-dtc',
    website: 'https://hypergrowthdtc.com',
    instagram: '@hypergrowthdtc',
    location: 'Austin, TX',
    country: 'United States',
    outreachStage: 'meeting_scheduled',
    status: 'active',
    dealValue: 26000,
    dealStage: 'meeting_booked',
    dealProbability: 65,
    leadScore: 87,
    notes: 'Managing $40M annual GMV across Shopify Plus brands. Needs automated abandoned cart SMS/WhatsApp retargeting engine.',
    inboundIntent: 'meeting_requested',
    inboundIntentConfidence: 0.93,
    hasInboundReply: true,
    replyText: 'Yes! Let us hop on a call Friday at 11 AM Central. I will invite our head of growth marketing as well.',
    taskTitle: 'Prepare Shopify Plus integration demo for Michael Chang',
    taskPriority: 'high',
  },
  {
    businessName: 'PulseFit Athletic Labs',
    primaryContactName: 'Jessica Miller (Director of Operations)',
    category: 'Fitness & Wellness',
    email: 'jessica@pulsefitlabs.com',
    phone: '+1 303-622-1980',
    whatsapp: '+1 303-622-1980',
    linkedin: 'https://linkedin.com/company/pulsefit-labs',
    website: 'https://pulsefitlabs.com',
    instagram: '@pulsefitlabs',
    location: 'Denver, CO',
    country: 'United States',
    outreachStage: 'proposal_sent',
    status: 'active',
    dealValue: 18500,
    dealStage: 'proposal_sent',
    dealProbability: 70,
    leadScore: 82,
    notes: 'Chain of 12 biohacking & athletic recovery facilities. Needs member onboarding automated sequence.',
    inboundIntent: 'interested',
    hasInboundReply: true,
    replyText: 'We went over the quote in our management meeting. Could you do $16,500 if we commit to an annual upfront contract?',
    taskTitle: 'Send revised annual discount offer to Jessica',
    taskPriority: 'medium',
  },
  {
    businessName: 'UrbanCore Real Estate Partners',
    primaryContactName: 'Anthony Rossi (Principal Broker)',
    category: 'Real Estate & Development',
    email: 'arossi@urbancorere.com',
    phone: '+1 206-441-8930',
    whatsapp: '+1 206-441-8930',
    linkedin: 'https://linkedin.com/company/urbancore-real-estate',
    website: 'https://urbancorere.com',
    location: 'Seattle, WA',
    country: 'United States',
    outreachStage: 'replied',
    status: 'active',
    dealValue: 39000,
    dealStage: 'audit_sent',
    dealProbability: 45,
    leadScore: 85,
    notes: 'Commercial leasing and multifamily investment syndicates. Looking for automated property inquiry handling.',
    inboundIntent: 'interested',
    inboundIntentConfidence: 0.90,
    hasInboundReply: true,
    replyText: 'We get a lot of inquiries off Zillow and our website. Can this system automatically book property tours directly into our brokers Google Calendars?',
    taskTitle: 'Send video demonstration of Google Calendar 2-way sync to Anthony',
    taskPriority: 'medium',
  },
  {
    businessName: 'EcoWatt Solar Dynamics',
    primaryContactName: 'Lucas Weber (VP of Engineering)',
    category: 'Clean Tech & Energy',
    email: 'l.weber@ecowattdynamics.de',
    phone: '+49 30 8912 3456',
    whatsapp: '+49 30 8912 3456',
    linkedin: 'https://linkedin.com/company/ecowatt-solar',
    website: 'https://ecowattdynamics.de',
    location: 'Berlin',
    country: 'Germany',
    outreachStage: 'contacted',
    status: 'active',
    dealValue: 56000,
    dealStage: 'interested',
    dealProbability: 35,
    leadScore: 76,
    notes: 'Commercial rooftop solar installations across EU. Cold outreach sent with technical compliance audit.',
    taskTitle: 'Schedule automated LinkedIn outreach follow-up for Lucas Weber',
    taskPriority: 'low',
  },
  {
    businessName: 'FinEdge Capital Partners',
    primaryContactName: 'Wei Ling Tan (Chief Investment Officer)',
    category: 'Financial Services',
    email: 'weiling.tan@finedgecapital.sg',
    phone: '+65 6789 0123',
    whatsapp: '+65 6789 0123',
    linkedin: 'https://linkedin.com/company/finedge-capital',
    website: 'https://finedgecapital.sg',
    location: 'Singapore, Marina Bay',
    country: 'Singapore',
    outreachStage: 'won',
    status: 'client',
    dealValue: 95000,
    dealStage: 'won',
    dealProbability: 100,
    leadScore: 97,
    notes: 'Fintech growth equity fund managing $600M AUM. Signed annual enterprise consulting SLA.',
    inboundIntent: 'interested',
    hasInboundReply: true,
    replyText: 'Delighted to have the partnership official. The onboarding deck was comprehensive and our team is ready.',
    taskTitle: 'Quarterly pipeline review preparation for FinEdge team',
    taskPriority: 'medium',
  },
  {
    businessName: 'Horizon Dental Studios',
    primaryContactName: 'Dr. Nathan Bradley (Clinic Director)',
    category: 'Healthcare & Medical',
    email: 'dr.bradley@horizondental.com',
    phone: '+1 617-555-4321',
    whatsapp: '+1 617-555-4321',
    linkedin: 'https://linkedin.com/in/nathan-bradley-dmd',
    website: 'https://horizondental.com',
    facebook: 'HorizonDentalStudios',
    location: 'Boston, MA',
    country: 'United States',
    outreachStage: 'replied',
    status: 'active',
    dealValue: 22000,
    dealStage: 'audit_sent',
    dealProbability: 50,
    leadScore: 81,
    notes: 'State-of-the-art dental practice. Inbound inquiry about patient recall automations.',
    inboundIntent: 'interested',
    hasInboundReply: true,
    replyText: 'Can this integrate with Dentrix or Eaglesoft for patient appointment reminders?',
    taskTitle: 'Check Dentrix PMS compatibility matrix and reply to Dr. Bradley',
    taskPriority: 'high',
  },
  {
    businessName: 'Krypton DevOps & AI Solutions',
    primaryContactName: 'Arjun Mehta (Head of Cloud Engineering)',
    category: 'Technology & SaaS',
    email: 'arjun.mehta@kryptoncloud.in',
    phone: '+91 98201 23456',
    whatsapp: '+91 98201 23456',
    linkedin: 'https://linkedin.com/company/krypton-cloud-ai',
    website: 'https://kryptoncloud.in',
    location: 'Bangalore, Karnataka',
    country: 'India',
    outreachStage: 'meeting_scheduled',
    status: 'active',
    dealValue: 36000,
    dealStage: 'meeting_booked',
    dealProbability: 60,
    leadScore: 88,
    notes: 'Kubernetes & generative AI infrastructure consulting. Interested in co-marketing and SEO dominance in US markets.',
    inboundIntent: 'meeting_requested',
    inboundIntentConfidence: 0.94,
    hasInboundReply: true,
    replyText: 'Namaste Alex. Yes, let us have a conversation this Thursday evening IST. I will prepare our service overview.',
    taskTitle: 'Set up calendar invite for Arjun Mehta (Bangalore time zone converted)',
    taskPriority: 'high',
  },
  {
    businessName: 'Cobalt Automotive Engineering',
    primaryContactName: 'Robert Vance (VP of Manufacturing)',
    category: 'Automotive & Hardware',
    email: 'rvance@cobaltauto.com',
    phone: '+1 313-880-9120',
    whatsapp: '+1 313-880-9120',
    linkedin: 'https://linkedin.com/company/cobalt-automotive',
    website: 'https://cobaltauto.com',
    location: 'Detroit, MI',
    country: 'United States',
    outreachStage: 'contacted',
    status: 'active',
    dealValue: 44000,
    dealStage: 'interested',
    dealProbability: 25,
    leadScore: 72,
    notes: 'EV battery pack component manufacturer. First outreach email sent yesterday.',
    taskTitle: 'Monitor email open and click-through on EV whitepaper',
    taskPriority: 'low',
  },
  {
    businessName: 'Optima Retail Brands',
    primaryContactName: 'Hannah Cole (Head of Omnichannel Retail)',
    category: 'E-Commerce & Retail',
    email: 'hannah.c@optimaretail.com',
    phone: '+1 404-770-5510',
    whatsapp: '+1 404-770-5510',
    linkedin: 'https://linkedin.com/company/optima-retail-brands',
    website: 'https://optimaretail.com',
    instagram: '@optimaretail',
    facebook: 'OptimaRetailBrands',
    location: 'Atlanta, GA',
    country: 'United States',
    outreachStage: 'proposal_sent',
    status: 'active',
    dealValue: 31000,
    dealStage: 'proposal_sent',
    dealProbability: 70,
    leadScore: 83,
    notes: 'Operating 40 apparel stores across Southeast. Testing WhatsApp customer care and loyalty automation.',
    inboundIntent: 'interested',
    hasInboundReply: true,
    replyText: 'We are reviewing the pricing options in our quarterly budget review this Wednesday.',
    taskTitle: 'Follow up with Hannah Cole regarding store rollout timeline',
    taskPriority: 'medium',
  },
  {
    businessName: 'Novus Pharma Innovations',
    primaryContactName: 'Dr. Beatrix Meyer (Chief Scientific Officer)',
    category: 'Healthcare & Medical',
    email: 'b.meyer@novuspharma.ch',
    phone: '+41 44 210 9876',
    whatsapp: '+41 44 210 9876',
    linkedin: 'https://linkedin.com/company/novus-pharma-innovations',
    website: 'https://novuspharma.ch',
    location: 'Zurich',
    country: 'Switzerland',
    outreachStage: 'contacted',
    status: 'active',
    dealValue: 85000,
    dealStage: 'interested',
    dealProbability: 30,
    leadScore: 79,
    notes: 'Biotech clinical trial software provider. High value European enterprise prospect.',
    taskTitle: 'Draft personalized follow-up with EU data privacy compliance guarantee',
    taskPriority: 'medium',
  },
  {
    businessName: 'BlueWave Freight & Logistics',
    primaryContactName: 'Jan Van Dijk (Managing Director)',
    category: 'Logistics & Supply Chain',
    email: 'j.vandijk@bluewavefreight.nl',
    phone: '+31 10 400 5678',
    whatsapp: '+31 10 400 5678',
    linkedin: 'https://linkedin.com/company/bluewave-freight',
    website: 'https://bluewavefreight.nl',
    location: 'Rotterdam',
    country: 'Netherlands',
    outreachStage: 'negotiation',
    status: 'active',
    dealValue: 47000,
    dealStage: 'negotiation',
    dealProbability: 80,
    leadScore: 90,
    notes: 'Maritime shipping and customs brokerage. Wants WhatsApp container tracking notifications.',
    inboundIntent: 'interested',
    hasInboundReply: true,
    replyText: 'We agree on the core terms. Please send over the final contract for signature.',
    taskTitle: 'Send final contract for Rotterdam container automation rollout',
    taskPriority: 'high',
  },
  {
    businessName: 'Elevate Talent Partners',
    primaryContactName: 'Samantha Brooks (Managing Partner)',
    category: 'Professional Services',
    email: 'samantha@elevatetalent.com',
    phone: '+1 408-555-7890',
    whatsapp: '+1 408-555-7890',
    linkedin: 'https://linkedin.com/company/elevate-talent-partners',
    website: 'https://elevatetalent.com',
    location: 'San Jose, CA',
    country: 'United States',
    outreachStage: 'won',
    status: 'client',
    dealValue: 35000,
    dealStage: 'won',
    dealProbability: 100,
    leadScore: 96,
    notes: 'Executive recruiting agency specializing in Silicon Valley AI & engineering leaders.',
    inboundIntent: 'interested',
    hasInboundReply: true,
    replyText: 'The outbound candidate pipeline automation has increased our placement speed by 40%. Thank you!',
    taskTitle: 'Schedule monthly client review with Samantha',
    taskPriority: 'medium',
  },
  {
    businessName: 'Proctor & Sterling Architecture',
    primaryContactName: 'James Proctor (Senior Design Director)',
    category: 'Architecture & Design',
    email: 'jproctor@proctorsterling.com.au',
    phone: '+61 3 9800 1234',
    whatsapp: '+61 3 9800 1234',
    linkedin: 'https://linkedin.com/company/proctor-sterling',
    website: 'https://proctorsterling.com.au',
    instagram: '@proctorsterling',
    location: 'Melbourne, VIC',
    country: 'Australia',
    outreachStage: 'replied',
    status: 'active',
    dealValue: 29000,
    dealStage: 'audit_sent',
    dealProbability: 50,
    leadScore: 84,
    notes: 'Luxury sustainable commercial and residential architecture. Requested SEO website audit.',
    inboundIntent: 'interested',
    hasInboundReply: true,
    replyText: 'The technical performance audit showed our high-res portfolio images are slowing our page load. Can your team fix the CDN and compression?',
    taskTitle: 'Send Image CDN & Technical Performance Proposal to James',
    taskPriority: 'high',
  },
  {
    businessName: 'Summit Wealth Advisors',
    primaryContactName: 'Gregory Sterling (Senior Wealth Consultant)',
    category: 'Financial Services',
    email: 'gregory.s@summitwealth.com',
    phone: '+1 214-602-9988',
    whatsapp: '+1 214-602-9988',
    linkedin: 'https://linkedin.com/company/summit-wealth-advisors',
    website: 'https://summitwealth.com',
    location: 'Dallas, TX',
    country: 'United States',
    outreachStage: 'meeting_scheduled',
    status: 'active',
    dealValue: 58000,
    dealStage: 'meeting_booked',
    dealProbability: 60,
    leadScore: 89,
    notes: 'Retirement and wealth planning consultancy with $300M under advisory. Meeting booked for next Tuesday.',
    inboundIntent: 'meeting_requested',
    inboundIntentConfidence: 0.92,
    hasInboundReply: true,
    replyText: 'Looking forward to our call next Tuesday at 10 AM CST. We will have our digital marketing director joining as well.',
    taskTitle: 'Prepare Dallas wealth market benchmark slide deck for Gregory',
    taskPriority: 'high',
  },
];

export async function seedRealisticCrmData(): Promise<void> {
  console.log('[Seed] Starting Production-Grade CRM Ecosystem Population...');

  // Clean out stale dummy leads with null info
  await query(`DELETE FROM leads WHERE email IS NULL AND phone IS NULL AND website IS NULL`);

  let insertedCount = 0;
  let dealCount = 0;
  let taskCount = 0;
  let activityCount = 0;
  let conversationCount = 0;

  for (const item of SEED_LEADS) {
    // Check if lead already exists by email or business name
    const existing = await query(`SELECT id FROM leads WHERE email = $1 OR business_name = $2 LIMIT 1`, [
      item.email,
      item.businessName,
    ]);

    let leadId: string;

    if (existing.rows.length > 0) {
      leadId = existing.rows[0].id;
      // Update with rich metadata
      await query(
        `UPDATE leads SET
          business_name = $1,
          primary_contact_name = $2,
          category = $3,
          phone = $4,
          whatsapp = $5,
          linkedin = $6,
          website = $7,
          instagram = $8,
          facebook = $9,
          location = $10,
          country = $11,
          outreach_stage = $12,
          status = $13,
          notes = $14,
          inbound_intent = $15,
          inbound_intent_confidence = $16,
          metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{deal_value}',
            to_jsonb($17::numeric)
          ) || jsonb_build_object('lead_score', $18::numeric, 'priority', 'high'),
          updated_at = NOW()
        WHERE id = $19`,
        [
          item.businessName,
          item.primaryContactName,
          item.category,
          item.phone,
          item.whatsapp,
          item.linkedin,
          item.website,
          item.instagram || '',
          item.facebook || '',
          item.location,
          item.country,
          item.outreachStage,
          item.status,
          item.notes,
          item.inboundIntent || 'none',
          item.inboundIntentConfidence || 0.85,
          item.dealValue,
          item.leadScore,
          leadId,
        ]
      );
    } else {
      // Insert new lead (this will automatically trigger trg_auto_assign_lead_channel_lists!)
      const insRes = await query(
        `INSERT INTO leads (
          business_name,
          primary_contact_name,
          category,
          email,
          phone,
          whatsapp,
          linkedin,
          website,
          instagram,
          facebook,
          location,
          country,
          outreach_stage,
          status,
          notes,
          inbound_intent,
          inbound_intent_confidence,
          email_verified,
          email_verification_status,
          metadata,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, true, 'verified',
          jsonb_build_object('deal_value', $18::numeric, 'lead_score', $19::numeric, 'priority', 'high'),
          NOW() - INTERVAL '10 days',
          NOW()
        ) RETURNING id`,
        [
          item.businessName,
          item.primaryContactName,
          item.category,
          item.email,
          item.phone,
          item.whatsapp,
          item.linkedin,
          item.website,
          item.instagram || '',
          item.facebook || '',
          item.location,
          item.country,
          item.outreachStage,
          item.status,
          item.notes,
          item.inboundIntent || 'none',
          item.inboundIntentConfidence || 0.85,
          item.dealValue,
          item.leadScore,
        ]
      );
      leadId = insRes.rows[0].id;
      insertedCount++;
    }

    // 2. Ensure Associated Deal in deals table
    const existingDeal = await query(`SELECT id FROM deals WHERE lead_id = $1 LIMIT 1`, [leadId]);
    let dealId: string;

    if (existingDeal.rows.length === 0) {
      const dealRes = await query(
        `INSERT INTO deals (
          lead_id,
          title,
          value,
          stage,
          probability,
          contact_name,
          contact_email,
          contact_phone,
          expected_close_date,
          notes,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '30 days', $9, NOW(), NOW()
        ) RETURNING id`,
        [
          leadId,
          `${item.businessName} - Omnichannel Growth & Tech Audit`,
          item.dealValue,
          item.dealStage,
          item.dealProbability,
          item.primaryContactName.split('(')[0].trim(),
          item.email,
          item.phone,
          item.notes,
        ]
      );
      dealId = dealRes.rows[0].id;
      dealCount++;
    } else {
      dealId = existingDeal.rows[0].id;
    }

    // 3. Ensure Activity Logs
    const existingActivities = await query(`SELECT id FROM activity_logs WHERE lead_id = $1 LIMIT 1`, [leadId]);
    if (existingActivities.rows.length === 0) {
      await query(
        `INSERT INTO activity_logs (lead_id, deal_id, actor_type, activity_type, title, description, created_at)
         VALUES 
          ($1, $2, 'system', 'lead_created', 'Lead Enriched & Scored', 'Scored at ' || $3 || '/100 based on company domain and decision maker seniority.', NOW() - INTERVAL '5 days'),
          ($1, $2, 'user', 'stage_changed', 'Stage Updated: ' || $4, 'Pipeline stage updated to ' || $4 || ' with estimated value of $' || $5, NOW() - INTERVAL '3 days')`,
        [leadId, dealId, item.leadScore, item.dealStage, item.dealValue]
      );
      activityCount += 2;

      if (item.hasInboundReply) {
        await query(
          `INSERT INTO activity_logs (lead_id, deal_id, actor_type, activity_type, title, description, created_at)
           VALUES ($1, $2, 'lead', 'inbound_received', 'Inbound Reply Received', $3, NOW() - INTERVAL '1 day')`,
          [leadId, dealId, item.replyText || 'Interested in demonstration']
        );
        activityCount++;
      }
    }

    // 4. Ensure Scheduled Tasks
    if (item.taskTitle) {
      const existingTask = await query(`SELECT id FROM tasks WHERE lead_id = $1 LIMIT 1`, [leadId]);
      if (existingTask.rows.length === 0) {
        await query(
          `INSERT INTO tasks (lead_id, deal_id, title, due_date, priority, status, task_type, created_at, updated_at)
           VALUES ($1, $2, $3, NOW() + INTERVAL '2 days', $4, 'pending', 'follow_up', NOW(), NOW())`,
          [leadId, dealId, item.taskTitle, item.taskPriority || 'medium']
        );
        taskCount++;
      }
    }

    // 5. Ensure Conversations & Inbound Messages
    if (item.hasInboundReply && item.replyText) {
      const existingConv = await query(
        `SELECT id FROM conversations WHERE lead_id = $1 LIMIT 1`,
        [leadId]
      );

      let convId: string;
      if (existingConv.rows.length === 0) {
        const convRes = await query(
          `INSERT INTO conversations (entity_type, lead_id, channel, status, subject, last_message_at, created_at, updated_at)
           VALUES ('lead', $1, 'email', 'open', $2, NOW() - INTERVAL '1 day', NOW() - INTERVAL '3 days', NOW())
           RETURNING id`,
          [leadId, `Re: Cloud & Omnichannel Outreach - ${item.businessName}`]
        );
        convId = convRes.rows[0].id;
        conversationCount++;

        // Initial outbound message
        await query(
          `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at, created_at)
           VALUES ($1, 'email', 'outbound', $2, 'delivered', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days')`,
          [
            convId,
            `Hi ${item.primaryContactName.split(' ')[0]},\n\nWe analyzed ${item.businessName}'s digital touchpoints and identified 3 key opportunities to scale qualified enterprise pipeline.\n\nWorth a quick look?`,
          ]
        );

        // Inbound prospect reply
        await query(
          `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at, created_at, is_read)
           VALUES ($1, 'email', 'inbound', $2, 'sent', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', false)`,
          [convId, item.replyText]
        );
      }
    }
  }

  console.log(`[Seed Complete] Results:`);
  console.log(`  - Leads Processed: ${SEED_LEADS.length} (${insertedCount} newly inserted)`);
  console.log(`  - Deals Created: ${dealCount}`);
  console.log(`  - Tasks Created: ${taskCount}`);
  console.log(`  - Activities Logged: ${activityCount}`);
  console.log(`  - Conversations Populated: ${conversationCount}`);
}

// Execute if run directly
if (process.argv[1]?.includes('seed_realistic_crm.ts')) {
  seedRealisticCrmData()
    .then(() => {
      console.log('✅ CRM Seeding Completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ CRM Seeding failed:', err);
      process.exit(1);
    });
}

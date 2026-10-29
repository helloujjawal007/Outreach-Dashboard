export interface DealCalculationInput {
  businessName?: string;
  category?: string;
  website?: string | null;
  auditScore?: number | null;
  location?: string | null;
  country?: string | null;
  hasWebsite?: boolean;
}

export interface DealCalculationResult {
  estimatedValue: number;
  monthlyRetainer: number;
  currency: string;
  probability: number;
  tier: 'enterprise' | 'premium' | 'standard' | 'growth';
  recommendedServices: string[];
  rationale: string;
}

/**
 * Calculates realistic, value-based deal value for any lead based on industry tier,
 * website availability, and technical audit score.
 */
export function calculateDealValue(input: DealCalculationInput): DealCalculationResult {
  const cat = (input.category || '').toLowerCase();
  const rawWeb = (input.website || '').trim();
  const isMapsUrl = /google\.com\/maps|maps\.google\.com/i.test(rawWeb);
  const hasWebsite = input.hasWebsite !== undefined ? input.hasWebsite : Boolean(rawWeb && !isMapsUrl && rawWeb.toLowerCase() !== 'n/a' && rawWeb.toLowerCase() !== 'none');
  const auditScore = input.auditScore !== undefined && input.auditScore !== null ? Number(input.auditScore) : undefined;

  let baseAnnual = 24000;
  let tier: DealCalculationResult['tier'] = 'standard';
  const services: string[] = [];

  // 1. Industry / Category Base Tier
  if (
    cat.includes('logistics') ||
    cat.includes('supply chain') ||
    cat.includes('freight') ||
    cat.includes('pharmaceutical') ||
    cat.includes('b2b') ||
    cat.includes('manufacturing')
  ) {
    baseAnnual = 48000;
    tier = 'enterprise';
    services.push('Omnichannel Customer Tracking Portal', 'WhatsApp & Email Automated Alerts', 'High-Trust B2B Web Infrastructure');
  } else if (
    cat.includes('legal') ||
    cat.includes('law') ||
    cat.includes('attorney') ||
    cat.includes('wealth') ||
    cat.includes('financial') ||
    cat.includes('accounting') ||
    cat.includes('compliance')
  ) {
    baseAnnual = 42000;
    tier = 'premium';
    services.push('High-Ticket Lead Intake Funnel', 'Authority Legal SEO & Content Strategy', 'Fast-Track Consultation Booking');
  } else if (
    cat.includes('dental') ||
    cat.includes('medical') ||
    cat.includes('clinic') ||
    cat.includes('health') ||
    cat.includes('hospital') ||
    cat.includes('doctor')
  ) {
    baseAnnual = 32000;
    tier = 'premium';
    services.push('Automated Appointment Confirmations', 'HIPAA-Compliant Patient Portal', 'Local Google Maps Dominance Pack');
  } else if (
    cat.includes('agency') ||
    cat.includes('design') ||
    cat.includes('media') ||
    cat.includes('real estate') ||
    cat.includes('fitness') ||
    cat.includes('gym') ||
    cat.includes('wellness')
  ) {
    baseAnnual = 26000;
    tier = 'standard';
    services.push('Modern Interactive Portfolio/Landing Site', 'Local Search SEO', 'Omnichannel Membership Intake');
  } else {
    baseAnnual = 18000;
    tier = 'growth';
    services.push('Mobile Website Launch', 'Local Google Business Profile SEO', 'Direct Click-to-Call / WhatsApp Leads');
  }

  // 2. Scope Adjustments based on Website & Audit Presence
  let scopeAdjustment = 0;
  let rationale = '';

  if (!hasWebsite) {
    // Lead has no website -> High-value new website build + Local SEO Setup
    scopeAdjustment = 8000;
    services.unshift('Complete Custom Website Development (Mobile-First, High-Speed)');
    services.unshift('Local Google Search Engine Optimization (SEO)');
    rationale = `No active website detected. Package includes complete Custom Mobile Website Development ($8k setup) + 12-Month Local SEO & Google Ranking Retainer.`;
  } else if (auditScore !== undefined) {
    if (auditScore < 50) {
      scopeAdjustment = 6000;
      services.unshift('Comprehensive Technical Audit Rebuild & Core Web Vitals Fix');
      services.unshift('Technical SEO & Structured Schema Markup Implementation');
      rationale = `Critical website diagnostic score (${auditScore}/100) identified in audit PDF. Package includes Full Technical Rebuild + High-Intent SEO Recovery.`;
    } else if (auditScore < 75) {
      scopeAdjustment = 3500;
      services.unshift('Core Web Vitals Speed & Performance Optimization');
      services.unshift('Organic Search Engine Optimization (SEO) Retainer');
      rationale = `Moderate website diagnostic score (${auditScore}/100). Package includes Speed Optimization + Ongoing Organic Search SEO Retainer.`;
    } else {
      scopeAdjustment = 1500;
      services.unshift('Continuous Conversion Rate Optimization (CRO)');
      services.unshift('Advanced Omnichannel Retainer');
      rationale = `Strong website baseline (${auditScore}/100). Package focuses on Ongoing Growth Retainer & Omnichannel Conversion Automations.`;
    }
  } else {
    // Has website but pending audit
    scopeAdjustment = 2000;
    services.unshift('Technical Audit Remediation & Ongoing SEO Optimization');
    rationale = `Standard B2B Digital Growth & SEO Retainer.`;
  }

  const finalEstimatedAnnual = Math.round((baseAnnual + scopeAdjustment) / 1000) * 1000;
  const monthlyRetainer = Math.round(finalEstimatedAnnual / 12);

  return {
    estimatedValue: finalEstimatedAnnual,
    monthlyRetainer,
    currency: 'USD',
    probability: 25,
    tier,
    recommendedServices: Array.from(new Set(services)),
    rationale,
  };
}

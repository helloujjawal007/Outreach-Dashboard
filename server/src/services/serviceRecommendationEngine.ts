/**
 * Service Recommendation Engine
 * Analyzes Technical Dashboard (TD) audit JSON findings and matches them directly
 * to official Cloud Consultancy service offerings (https://cloudconsultancy.in/).
 *
 * If findings are ambiguous, contradictory, or unclassifiable, flags confusion
 * so the lead is moved to the manual review list with an explicit reason.
 */

export interface MatchedService {
  id: string;
  serviceName: string;
  category: 'performance' | 'seo' | 'ui_ux' | 'security' | 'lead_automation';
  valueProposition: string;
  problemSummary: string;
  confidence: number;
}

export interface AuditAnalysisResult {
  isConfused: boolean;
  confusionReason?: string;
  cleanSite: boolean;
  matchedServices: MatchedService[];
  primaryService?: MatchedService;
  executivePitch?: string;
}

// Official services offered on https://cloudconsultancy.in/
export const CLOUD_CONSULTANCY_SERVICES = {
  PERFORMANCE: {
    id: 'high-perf-web-dev',
    serviceName: 'High-Performance Website Development & Core Web Vitals Optimization',
    category: 'performance' as const,
    valueProposition:
      'We re-architect mobile web performance (Next.js SSR, image compression, edge caching) to achieve sub-second load times and 90+ Lighthouse scores.',
  },
  TECHNICAL_SEO: {
    id: 'technical-seo',
    serviceName: 'Organic Growth & Technical SEO Services',
    category: 'seo' as const,
    valueProposition:
      'We implement complete on-page technical SEO, JSON-LD Schema structured data, and indexing architecture to elevate organic search ranking and local Google visibility.',
  },
  UI_UX_DESIGN: {
    id: 'product-ui-ux',
    serviceName: 'Product UI/UX Design & Modern Responsive Engineering',
    category: 'ui_ux' as const,
    valueProposition:
      'We modernize your mobile layout into a high-converting, mobile-first experience that eliminates layout shifts and keeps prospective clients engaged.',
  },
  SECURITY_INFRA: {
    id: 'cloud-infra-maintenance',
    serviceName: 'Cloud Infrastructure, Security & Continuous Maintenance',
    category: 'security' as const,
    valueProposition:
      'We configure end-to-end SSL encryption, cloud security headers, and continuous maintenance to guarantee verified browser trust and high uptime.',
  },
  LEAD_AUTOMATION: {
    id: 'ai-lead-automation',
    serviceName: 'AI Chatbot & Inbound Lead Capture Automation',
    category: 'lead_automation' as const,
    valueProposition:
      'We deploy 24/7 conversational AI assistants to capture website inquiries and turn site traffic into booked consultations automatically.',
  },
};

const PARKED_DOMAIN_PATTERNS = [
  /domain (?:for sale|is for sale|parked|expired)/i,
  /buy this domain/i,
  /hugedomains/i,
  /godaddy(?:\.com)? (?:parking|parked)/i,
  /namecheap(?:\.com)? parking/i,
  /sedo(?:\.com)?/i,
  /dan\.com/i,
  /under construction/i,
  /dns error|domain not resolved|name not resolved|nxdomain/i,
  /website coming soon/i,
];

export class ServiceRecommendationEngine {
  /**
   * Analyzes the audit findings JSON, extracts actionable flaws,
   * pairs them with Cloud Consultancy services, or flags confusion.
   */
  public analyzeAudit(
    rawFindings: any,
    rawScore?: number | null,
    leadContext?: { businessName?: string; website?: string; notes?: string }
  ): AuditAnalysisResult {
    // 1. Normalize findings array
    let findings: string[] = [];
    if (Array.isArray(rawFindings)) {
      findings = rawFindings.map((f) => String(f).trim()).filter(Boolean);
    } else if (typeof rawFindings === 'string') {
      try {
        const parsed = JSON.parse(rawFindings);
        if (Array.isArray(parsed)) {
          findings = parsed.map((f) => String(f).trim()).filter(Boolean);
        } else if (typeof parsed === 'object' && parsed !== null) {
          findings = Object.values(parsed).map((f) => String(f).trim()).filter(Boolean);
        }
      } catch {
        findings = rawFindings
          .split(/;|\n|•/)
          .map((s) => s.trim())
          .filter((s) => s.length > 5);
      }
    }

    // 2. Check for Parked Domain / Placeholder / Inaccessible Site
    const combinedText = `${leadContext?.website || ''} ${findings.join(' ')} ${leadContext?.notes || ''}`;
    for (const pattern of PARKED_DOMAIN_PATTERNS) {
      if (pattern.test(combinedText)) {
        return {
          isConfused: true,
          confusionReason: `Parked, expired, or non-operational domain detected (${leadContext?.website || 'site'}). Not an active business website.`,
          cleanSite: false,
          matchedServices: [],
        };
      }
    }

    // 3. Clean Site check: 0 flaws reported and high score
    const score = typeof rawScore === 'number' ? rawScore : undefined;
    if (findings.length === 0 && (score === undefined || score >= 90)) {
      return {
        isConfused: false,
        cleanSite: true,
        matchedServices: [],
      };
    }

    // 4. Confusion Check: Empty findings on a poor/medium score
    if (findings.length === 0) {
      return {
        isConfused: true,
        confusionReason: `Empty audit findings from Technical Dashboard for score ${score ?? 'unknown'}. Cannot diagnose client requirements with certainty.`,
        cleanSite: false,
        matchedServices: [],
      };
    }

    // 5. Match Findings to Cloud Consultancy Service Categories
    const matched: MatchedService[] = [];
    const matchedCategories = new Set<string>();

    const perfIssues: string[] = [];
    const seoIssues: string[] = [];
    const uiIssues: string[] = [];
    const secIssues: string[] = [];

    findings.forEach((finding) => {
      const lower = finding.toLowerCase();

      // Performance & Core Web Vitals
      if (
        /lcp|largest contentful paint|fid|first input delay|inp|fcp|first contentful paint|cls|speed|load time|slow|ttfb|render-blocking|minify|unoptimized image|compression|cache|payload|lighthouse/i.test(
          lower
        )
      ) {
        perfIssues.push(finding);
      }

      // Technical SEO
      if (
        /seo|meta description|title tag|open graph|schema\.org|structured data|json-ld|canonical|sitemap|indexing|robots\.txt|h1 tag|alt attribute/i.test(
          lower
        )
      ) {
        seoIssues.push(finding);
      }

      // UI/UX & Responsive Layout
      if (
        /viewport|mobile-friendly|responsive|touch target|tap target|cumulative layout shift|layout shift|overflow|font legibility|screen size/i.test(
          lower
        )
      ) {
        uiIssues.push(finding);
      }

      // Security & Cloud Infrastructure
      if (
        /https|ssl|tls|mixed content|security header|hsts|content-security-policy|x-frame-options|certificate/i.test(
          lower
        )
      ) {
        secIssues.push(finding);
      }
    });

    if (perfIssues.length > 0) {
      matchedCategories.add('performance');
      matched.push({
        ...CLOUD_CONSULTANCY_SERVICES.PERFORMANCE,
        problemSummary: perfIssues.slice(0, 2).join('; '),
        confidence: Math.min(1.0, 0.6 + perfIssues.length * 0.15),
      });
    }

    if (seoIssues.length > 0) {
      matchedCategories.add('seo');
      matched.push({
        ...CLOUD_CONSULTANCY_SERVICES.TECHNICAL_SEO,
        problemSummary: seoIssues.slice(0, 2).join('; '),
        confidence: Math.min(1.0, 0.6 + seoIssues.length * 0.15),
      });
    }

    if (uiIssues.length > 0) {
      matchedCategories.add('ui_ux');
      matched.push({
        ...CLOUD_CONSULTANCY_SERVICES.UI_UX_DESIGN,
        problemSummary: uiIssues.slice(0, 2).join('; '),
        confidence: Math.min(1.0, 0.6 + uiIssues.length * 0.15),
      });
    }

    if (secIssues.length > 0) {
      matchedCategories.add('security');
      matched.push({
        ...CLOUD_CONSULTANCY_SERVICES.SECURITY_INFRA,
        problemSummary: secIssues.slice(0, 2).join('; '),
        confidence: Math.min(1.0, 0.6 + secIssues.length * 0.15),
      });
    }

    // 6. Confusion Check: Findings exist but zero Cloud Consultancy services could be matched
    if (matched.length === 0) {
      return {
        isConfused: true,
        confusionReason: `Unclassifiable technical findings (${findings.slice(0, 3).join(', ')}). No direct match with Cloud Consultancy service offerings.`,
        cleanSite: false,
        matchedServices: [],
      };
    }

    // Sort by confidence descending
    matched.sort((a, b) => b.confidence - a.confidence);
    const primaryService = matched[0];

    // Executive summary pitch referencing the primary service
    const executivePitch = `Based on the diagnostic findings (${primaryService.problemSummary}), we recommend Cloud Consultancy's ${primaryService.serviceName}: ${primaryService.valueProposition}`;

    return {
      isConfused: false,
      cleanSite: false,
      matchedServices: matched,
      primaryService,
      executivePitch,
    };
  }
}

export const serviceRecommendationEngine = new ServiceRecommendationEngine();


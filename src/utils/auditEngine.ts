import * as cheerio from 'cheerio';
import { Finding, AuditReport, CategoryScore } from '../types/audit';

export interface InspectionMetadata {
  targetUrl: string;
  finalUrl: string;
  httpStatus: number;
  headers: Record<string, string>;
  fetchTimeMs: number;
  contentType: string;
  contentLengthBytes: number;
  ipAddress?: string;
}

/**
 * Heuristics to detect modern client-side rendered (SPA) applications,
 * web components, and dynamic hydration shells.
 */
export function detectClientRenderedApp(html: string): { isClientRendered: boolean; markers: string[] } {
  const markers: string[] = [];

  // Custom element application roots (e.g. <ytd-app>, <app-root>, <ng-component>)
  const customElementAppMatch = html.match(/<(ytd-app|app-root|ng-component|next-route-announcer|[a-z0-9]+-(?:app|root|shell|container))\b/i);
  if (customElementAppMatch) {
    markers.push(`Custom element application root: <${customElementAppMatch[1]}>`);
  }

  // Common SPA container IDs
  if (html.includes('id="root"') || html.includes("id='root'")) markers.push('React/SPA container element (<div id="root">)');
  if (html.includes('id="__next"') || html.includes("id='__next'")) markers.push('Next.js application shell (<div id="__next">)');
  if (html.includes('id="app"') || html.includes("id='app'")) markers.push('Vue/SPA application shell (<div id="app">)');
  if (html.includes('id="__nuxt"') || html.includes("id='__nuxt'")) markers.push('Nuxt application shell (<div id="__nuxt">)');

  // Hydration data and client runtime configurations
  if (html.includes('ytcfg.set(') || html.includes('window.ytcfg')) markers.push('YouTube client config/hydration script (ytcfg)');
  if (html.includes('__NEXT_DATA__')) markers.push('Next.js client hydration payload (__NEXT_DATA__)');
  if (html.includes('window.__INITIAL_STATE__')) markers.push('SPA state store hydration (window.__INITIAL_STATE__)');
  if (html.includes('ng-version=')) markers.push('Angular application shell (ng-version)');

  // Web components density
  const customTags = html.match(/<[a-z]{2,15}-[a-z0-9_-]{2,20}\b/g);
  if (customTags && customTags.length >= 4 && !markers.some(m => m.includes('Custom element'))) {
    markers.push(`${customTags.length} web component tags detected in initial markup`);
  }

  return {
    isClientRendered: markers.length > 0,
    markers
  };
}

/**
 * Error classifications and diagnostic reasons for non-200 HTTP responses
 */
export function getHttpErrorDetails(status: number): { label: string; reason: string } {
  switch (status) {
    case 401:
      return {
        label: 'HTTP 401 Unauthorized',
        reason: 'Target page requires authentication or login credentials.'
      };
    case 403:
      return {
        label: 'HTTP 403 Forbidden',
        reason: 'Access was denied by the host or anti-bot firewall (e.g. Cloudflare, WAF). WebX-Ray respects access restrictions and does not bypass protections.'
      };
    case 429:
      return {
        label: 'HTTP 429 Too Many Requests',
        reason: 'The host server has rate-limited automated inspection requests.'
      };
    case 500:
      return {
        label: 'HTTP 500 Internal Server Error',
        reason: 'The target server encountered an internal error and could not serve the webpage.'
      };
    case 502:
      return {
        label: 'HTTP 502 Bad Gateway',
        reason: 'The reverse proxy or gateway received an invalid response from the upstream server.'
      };
    case 503:
      return {
        label: 'HTTP 503 Service Unavailable',
        reason: 'The target server is currently overloaded or down for maintenance.'
      };
    case 504:
      return {
        label: 'HTTP 504 Gateway Timeout',
        reason: 'The upstream server failed to respond before the gateway timed out.'
      };
    default:
      if (status >= 500) {
        return {
          label: `HTTP ${status} Server Error`,
          reason: 'The host server is experiencing internal errors or downtime.'
        };
      }
      return {
        label: `HTTP ${status} Client Error`,
        reason: 'The target server returned a client error response.'
      };
  }
}

/**
 * Generates an honest Incomplete Audit report when the target returns an HTTP error (403, 401, 429, 5xx).
 * Does not inspect error page HTML as website content, does not award fake performance scores,
 * and sets all unavailable scores to null.
 */
function generateErrorAudit(meta: InspectionMetadata, _html: string): Omit<AuditReport, 'aiAnalysis'> {
  const urlObj = new URL(meta.finalUrl || meta.targetUrl);
  const domain = urlObj.hostname;
  const errorDetails = getHttpErrorDetails(meta.httpStatus);
  const isHttps = (meta.finalUrl || meta.targetUrl).startsWith('https://');

  const findings: Finding[] = [];

  // 1. Technical: Primary Access Error / Block Finding
  findings.push({
    id: 'tech_http_status_error',
    category: 'technical',
    title: `Access Blocked: ${errorDetails.label}`,
    status: 'failed',
    priority: 'critical',
    testMethod: 'http_header_inspection',
    confidence: 'high',
    explanation: `The target server returned an error status (${errorDetails.label}). ${errorDetails.reason} WebX-Ray strictly respects access restrictions and never attempts to bypass authentication or anti-bot protections.`,
    evidence: `HTTP Status: ${meta.httpStatus}. Response payload: ${meta.contentLengthBytes} bytes. Time to first response: ${meta.fetchTimeMs}ms.`,
    whyItMatters: 'Because the target server returned an error or blocked access, verified website health and performance scores cannot be computed from an error page.',
    recommendation: 'Ensure public search crawlers and performance monitors are permitted in server firewall or WAF configuration.'
  });

  // 2. Technical: HTTPS Protocol
  if (isHttps) {
    findings.push({
      id: 'tech_https_passed',
      category: 'technical',
      title: 'HTTPS Protocol Enabled',
      status: 'passed',
      priority: 'low',
      testMethod: 'http_header_inspection',
      confidence: 'high',
      explanation: 'Connection was negotiated over encrypted HTTPS protocol.',
      evidence: `Scheme: https:// (target: ${meta.finalUrl || meta.targetUrl})`,
      whyItMatters: 'Encrypts in-transit data.',
      recommendation: 'Maintain active SSL/TLS certificates.'
    });
  } else {
    findings.push({
      id: 'tech_https_missing',
      category: 'technical',
      title: 'Insecure HTTP Protocol Detected',
      status: 'failed',
      priority: 'critical',
      testMethod: 'http_header_inspection',
      confidence: 'high',
      explanation: 'Target URL was served over unencrypted HTTP.',
      evidence: 'Scheme: http://',
      whyItMatters: 'Unencrypted connections risk tampering and downgrade search ranking.',
      recommendation: 'Redirect all traffic to HTTPS.'
    });
  }

  // 3. Technical: Character Encoding in Header
  const headerContentType = meta.headers['content-type'] || '';
  const headerHasCharset = /charset\s*=\s*['"]?([a-zA-Z0-9_-]+)/i.test(headerContentType);
  if (headerHasCharset) {
    findings.push({
      id: 'tech_charset_passed',
      category: 'technical',
      title: 'Character Encoding Declared in Response Header',
      status: 'passed',
      priority: 'low',
      testMethod: 'http_header_inspection',
      confidence: 'high',
      explanation: 'Character encoding is declared in the HTTP Content-Type header.',
      evidence: `Header: content-type: ${headerContentType}`,
      whyItMatters: 'Specifies character set interpretation for the response.',
      recommendation: 'Maintain explicit charset declarations.'
    });
  } else {
    findings.push({
      id: 'tech_charset_untested',
      category: 'technical',
      title: 'Character Encoding — Not Tested (Error Response)',
      status: 'not_tested',
      priority: 'low',
      testMethod: 'not_tested',
      confidence: 'high',
      explanation: `Website document character encoding cannot be verified on an HTTP ${meta.httpStatus} error page.`,
      evidence: `HTTP ${meta.httpStatus} returned; document head not verified.`,
      whyItMatters: 'Cannot verify real webpage encoding from an error page.',
      recommendation: 'Verify charset in production web server configuration.'
    });
  }

  // 4. Performance Checks: Technical Honesty (No 100% score for fast error responses)
  findings.push({
    id: 'perf_server_response_time',
    category: 'performance',
    title: `Server Response Time (Time to First Response): ${meta.fetchTimeMs}ms`,
    status: 'not_tested',
    priority: 'low',
    testMethod: 'http_header_inspection',
    confidence: 'high',
    explanation: `The server returned an HTTP ${meta.httpStatus} response in ${meta.fetchTimeMs}ms. While time to first response is recorded, overall website page-loading performance cannot be calculated from an error response.`,
    evidence: `Time to first response: ${meta.fetchTimeMs}ms (HTTP ${meta.httpStatus})`,
    whyItMatters: 'WebX-Ray adheres to technical honesty: a fast error response does not indicate a fast website.',
    recommendation: 'Resolve server access permissions to measure true website performance.'
  });

  findings.push({
    id: 'perf_html_size_untested',
    category: 'performance',
    title: 'Website Payload Size — Not Tested (Error Response)',
    status: 'not_tested',
    priority: 'low',
    testMethod: 'not_tested',
    confidence: 'high',
    explanation: `Received an HTTP ${meta.httpStatus} error response (${Math.round(meta.contentLengthBytes / 1024)}KB). Website document payload size cannot be calculated from an error response.`,
    evidence: `Received ${meta.contentLengthBytes} bytes error payload.`,
    whyItMatters: 'Reporting the size of an anti-bot or error page as the website weight produces misleading audits.',
    recommendation: 'Inspect actual website documents once access is granted.'
  });

  findings.push({
    id: 'perf_scripts_untested',
    category: 'performance',
    title: 'Script Dependencies & Assets — Not Tested',
    status: 'not_tested',
    priority: 'low',
    testMethod: 'not_tested',
    confidence: 'high',
    explanation: 'Script assets and render-blocking resources cannot be analyzed on an error response.',
    evidence: `HTTP ${meta.httpStatus} returned; website assets not accessible.`,
    whyItMatters: 'Dependencies must be verified from the actual website markup.',
    recommendation: 'Audit full website once access restrictions are resolved.'
  });

  findings.push({
    id: 'perf_cwv_untested',
    category: 'performance',
    title: 'Core Web Vitals (LCP, INP, CLS) — Browser Execution Required',
    status: 'not_tested',
    priority: 'low',
    testMethod: 'not_tested',
    confidence: 'high',
    explanation: 'Core Web Vitals require browser execution or field telemetry data.',
    evidence: 'Synthetic browser rendering engine not executed.',
    whyItMatters: 'WebX-Ray does not fabricate Core Web Vitals.',
    recommendation: 'Consult Google PageSpeed Insights for field telemetry.'
  });

  // 5. SEO Checks — Labeled Not Tested
  const seoChecklist = [
    { id: 'seo_title_untested', title: 'HTML <title> Tag — Not Tested (Access Denied / Error Response)' },
    { id: 'seo_desc_untested', title: 'Meta Description — Not Tested (Access Denied / Error Response)' },
    { id: 'seo_h1_untested', title: 'Primary H1 Heading — Not Tested (Access Denied / Error Response)' },
    { id: 'seo_canonical_untested', title: 'Canonical URL Tag — Not Tested (Access Denied / Error Response)' },
    { id: 'seo_og_untested', title: 'Open Graph & Social Metadata — Not Tested (Access Denied / Error Response)' },
    { id: 'seo_robots_untested', title: 'Robots Directives — Not Tested (Access Denied / Error Response)' },
    { id: 'seo_structured_data_untested', title: 'Structured Data Schema — Not Tested (Access Denied / Error Response)' },
  ];
  for (const item of seoChecklist) {
    findings.push({
      id: item.id,
      category: 'seo',
      title: item.title,
      status: 'not_tested',
      priority: 'low',
      testMethod: 'not_tested',
      confidence: 'high',
      explanation: `This check could not be performed because the target server returned HTTP ${meta.httpStatus} (${errorDetails.label}). WebX-Ray does not inspect error page HTML as a proxy for the actual website.`,
      evidence: `HTTP ${meta.httpStatus} error response; actual website document was not accessible.`,
      whyItMatters: 'Accurate SEO evaluation requires access to the genuine website markup.',
      recommendation: 'Ensure public search crawlers and auditors are allowed to access the website.'
    });
  }

  // 6. Accessibility Checks — Labeled Not Tested
  const a11yChecklist = [
    { id: 'a11y_lang_untested', title: 'HTML Language Attribute — Not Tested (Access Denied / Error Response)' },
    { id: 'a11y_viewport_untested', title: 'Responsive Viewport Meta Tag — Not Tested (Access Denied / Error Response)' },
    { id: 'a11y_images_untested', title: 'Image Alt Text Accessibility — Not Tested (Access Denied / Error Response)' },
    { id: 'a11y_buttons_untested', title: 'Interactive Controls Accessible Names — Not Tested (Access Denied / Error Response)' },
    { id: 'a11y_forms_untested', title: 'Form Input Accessible Labels — Not Tested (Access Denied / Error Response)' },
    { id: 'a11y_contrast_untested', title: 'Visual Color Contrast — Browser Execution Required' },
  ];
  for (const item of a11yChecklist) {
    findings.push({
      id: item.id,
      category: 'accessibility',
      title: item.title,
      status: 'not_tested',
      priority: 'low',
      testMethod: 'not_tested',
      confidence: 'high',
      explanation: `This check could not be performed because the target server returned HTTP ${meta.httpStatus} (${errorDetails.label}). WebX-Ray does not inspect error page HTML as a proxy for the actual website.`,
      evidence: `HTTP ${meta.httpStatus} error response; actual website document was not accessible.`,
      whyItMatters: 'Accessibility criteria must be verified against genuine website components.',
      recommendation: 'Test accessibility on the real production website.'
    });
  }

  // 7. Usability Checks — Labeled Not Tested
  const usabilityChecklist = [
    { id: 'usability_nav_untested', title: 'Semantic Navigation Landmarks — Not Tested (Access Denied / Error Response)' },
    { id: 'usability_favicon_untested', title: 'Favicon Configuration — Not Tested (Access Denied / Error Response)' },
    { id: 'usability_cta_untested', title: 'Conversion Call-to-Action — Not Tested (Access Denied / Error Response)' },
    { id: 'usability_touch_untested', title: 'Physical Touch Target Spacing — Not Tested' },
  ];
  for (const item of usabilityChecklist) {
    findings.push({
      id: item.id,
      category: 'usability',
      title: item.title,
      status: 'not_tested',
      priority: 'low',
      testMethod: 'not_tested',
      confidence: 'high',
      explanation: `This check could not be performed because the target server returned HTTP ${meta.httpStatus} (${errorDetails.label}). WebX-Ray does not inspect error page HTML as a proxy for the actual website.`,
      evidence: `HTTP ${meta.httpStatus} error response; actual website document was not accessible.`,
      whyItMatters: 'Usability patterns must be verified against the real website layout.',
      recommendation: 'Evaluate user flows on the live accessible website.'
    });
  }

  const unperformedChecks = [
    'HTML Document SEO (Title, Description, Headings, Canonical, OpenGraph)',
    'Web Accessibility & Structure (Language attribute, Alt text, Form labels, Buttons)',
    'Website Page-Loading Performance & Script Dependencies',
    'Usability, Navigation Landmarks & Conversion CTA Prompts'
  ];

  // Scoring for Incomplete Audit:
  // Every category has score: null (Score unavailable)
  // overallScore: null (Score unavailable)
  const buildErrorCategory = (cat: Finding['category']): CategoryScore => {
    const items = findings.filter(f => f.category === cat);
    return {
      score: null,
      passed: items.filter(f => f.status === 'passed').length,
      warning: items.filter(f => f.status === 'warning').length,
      failed: items.filter(f => f.status === 'failed').length,
      notTested: items.filter(f => f.status === 'not_tested').length,
      inconclusive: items.filter(f => f.status === 'inconclusive').length,
      applicableCount: 0
    };
  };

  return {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    url: meta.targetUrl,
    finalUrl: meta.finalUrl || meta.targetUrl,
    domain,
    timestamp: new Date().toISOString(),
    fetchTimeMs: meta.fetchTimeMs,
    httpStatus: meta.httpStatus,
    contentType: meta.contentType,
    contentLengthBytes: meta.contentLengthBytes,
    isClientRendered: false,
    clientRenderedMarkers: [],
    auditStatus: 'incomplete',
    auditStatusReason: errorDetails.reason,
    unperformedChecks,
    overallScore: null,
    categories: {
      seo: buildErrorCategory('seo'),
      technical: buildErrorCategory('technical'),
      accessibility: buildErrorCategory('accessibility'),
      performance: buildErrorCategory('performance'),
      usability: buildErrorCategory('usability')
    },
    findings,
    pageMeta: {
      title: '',
      description: '',
      canonical: '',
      h1Count: 0,
      h1Text: [],
      h2Count: 0,
      h3Count: 0,
      imagesCount: 0,
      imagesMissingAltCount: 0,
      linksCount: 0,
      externalLinksCount: 0,
      scriptsCount: 0,
      stylesCount: 0,
      hasViewport: false,
      hasLang: false,
      lang: '',
      hasOpenGraph: false,
      hasTwitterCard: false,
      hasFavicon: false,
      hasRobotsMeta: false,
      robotsMeta: '',
      hasStructuredData: false
    },
    securityHeaders: {
      hasHsts: Boolean(meta.headers['strict-transport-security']),
      hasCsp: Boolean(meta.headers['content-security-policy']),
      hasXFrameOptions: Boolean(meta.headers['x-frame-options']),
      hasXContentTypeOptions: Boolean(meta.headers['x-content-type-options']),
      hasReferrerPolicy: Boolean(meta.headers['referrer-policy'])
    },
    telemetry: {
      ipAddress: meta.ipAddress,
      serverHeader: meta.headers['server'],
      compression: meta.headers['content-encoding'],
      cacheControl: meta.headers['cache-control'],
      etag: meta.headers['etag'],
      wordCount: 0,
      readingTimeMin: 0,
      headingsSummary: {
        h1: [],
        h2: [],
        h3: []
      }
    }
  };
}

/**
 * Evaluates raw HTML and HTTP metadata to produce evidence-backed findings.
 * Does not fabricate results or assume client-rendered elements are absent.
 */
export function analyzeWebsite(
  meta: InspectionMetadata,
  html: string
): Omit<AuditReport, 'aiAnalysis'> {
  if (meta.httpStatus >= 400) {
    return generateErrorAudit(meta, html);
  }

  const $ = cheerio.load(html);
  const findings: Finding[] = [];
  const urlObj = new URL(meta.finalUrl || meta.targetUrl);
  const domain = urlObj.hostname;

  const { isClientRendered, markers } = detectClientRenderedApp(html);

  // 1. Page Title
  const titleTag = $('title').first().text().trim();
  if (!titleTag) {
    findings.push({
      id: 'seo_title_missing',
      category: 'seo',
      title: 'Missing HTML <title> Tag',
      status: 'failed',
      priority: 'critical',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'The initial server HTML does not define a <title> element in the <head>.',
      evidence: '<title> tag is absent in the parsed server HTML.',
      whyItMatters: 'Search engines rely heavily on page titles to index pages, and web browsers use them for tab labels and bookmarks.',
      recommendation: 'Add a distinct, descriptive <title> tag inside <head> including primary keywords.'
    });
  } else if (titleTag.length > 80) {
    findings.push({
      id: 'seo_title_long',
      category: 'seo',
      title: 'HTML Title Exceeds Recommended Length',
      status: 'warning',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: `The title is ${titleTag.length} characters long, which search engines typically truncate with an ellipsis.`,
      evidence: `Found title: "${titleTag}" (${titleTag.length} characters)`,
      whyItMatters: 'Truncated titles can cut off key value propositions and look unpolished in search listings.',
      recommendation: 'Condense your title tag to under 65-70 characters so it renders completely in Google and Bing search snippets.'
    });
  } else {
    // Contextual evaluation: short brand titles (e.g. "YouTube", "Stripe") are completely valid
    const isConciseBrand = titleTag.length < 15;
    findings.push({
      id: 'seo_title_optimal',
      category: 'seo',
      title: isConciseBrand ? 'Concise Brand Title Tag' : 'Optimal HTML Title Tag',
      status: 'passed',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: isConciseBrand
        ? `Found concise title "${titleTag}". For established brands, concise titles are standard and effective.`
        : 'The page title is properly structured within optimal search engine display bounds.',
      evidence: `Title: "${titleTag}" (${titleTag.length} characters)`,
      whyItMatters: 'Clear titles identify the website for users and search crawlers.',
      recommendation: isConciseBrand
        ? 'For secondary landing pages, consider appending a short descriptive category (e.g., "Brand — Topic"). For the homepage, brand titles are optimal.'
        : 'Keep monitoring CTR in Google Search Console to refine keyword effectiveness.'
    });
  }

  // 2. Meta Description
  const metaDesc = $('meta[name="description" i]').attr('content')?.trim() || '';
  if (!metaDesc) {
    findings.push({
      id: 'seo_desc_missing',
      category: 'seo',
      title: 'No Meta Description in Initial HTML',
      status: 'warning',
      priority: 'medium',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'No meta description tag was found in the initial server HTML payload.',
      evidence: '<meta name="description"> tag is absent from HTML <head>.',
      whyItMatters: 'When absent, search engines construct snippets automatically from available on-page text.',
      recommendation: 'Add a concise meta description tag of 120-160 characters describing the page value proposition.'
    });
  } else if (metaDesc.length > 175) {
    findings.push({
      id: 'seo_desc_long',
      category: 'seo',
      title: 'Meta Description May Be Truncated',
      status: 'warning',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: `The meta description is ${metaDesc.length} characters long and may be cut off on search result pages.`,
      evidence: `Description length: ${metaDesc.length} characters.`,
      whyItMatters: 'Cut-off sentences look unfinished and may obscure critical conversion copy.',
      recommendation: 'Keep meta descriptions between 120 and 160 characters to ensure full readability.'
    });
  } else {
    findings.push({
      id: 'seo_desc_optimal',
      category: 'seo',
      title: 'Meta Description Present',
      status: 'passed',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'A descriptive meta description tag is present in the document head.',
      evidence: `Meta description: "${metaDesc}" (${metaDesc.length} characters)`,
      whyItMatters: 'Provides a clean preview in search engine result snippets.',
      recommendation: 'Periodically review description copy to maintain alignment with current offerings.'
    });
  }

  // 3. Headings Structure (H1, H2, H3) - Distinguishing static vs dynamic
  const h1Elements = $('h1');
  const h1Count = h1Elements.length;
  const h1Texts: string[] = [];
  h1Elements.each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (text) h1Texts.push(text);
  });
  const h2Texts: string[] = [];
  $('h2').each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (text && h2Texts.length < 8) h2Texts.push(text);
  });
  const h3Texts: string[] = [];
  $('h3').each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (text && h3Texts.length < 8) h3Texts.push(text);
  });
  const h2Count = $('h2').length;
  const h3Count = $('h3').length;

  if (h1Count === 0) {
    if (isClientRendered) {
      findings.push({
        id: 'seo_h1_client_rendered',
        category: 'seo',
        title: 'H1 Heading Inconclusive (Client-Rendered App)',
        status: 'inconclusive',
        priority: 'medium',
        testMethod: 'static_html_analysis',
        confidence: 'medium',
        explanation: 'No <h1> tag was found in the initial server HTML, but dynamic client-side application shell markers were detected. Client frameworks (such as React, Vue, or Web Components) often render primary headings dynamically in the browser DOM upon JavaScript execution.',
        evidence: `Initial HTML contains 0 <h1> tags. Dynamic app shell detected: ${markers.slice(0, 2).join('; ')}`,
        whyItMatters: 'Static HTML inspection cannot inspect elements rendered dynamically via client-side JavaScript. This is marked Inconclusive rather than Failed.',
        recommendation: 'If this page is intended for public organic search indexing, consider Server-Side Rendering (SSR) for the primary heading so web crawlers discover it without executing JavaScript.'
      });
    } else {
      findings.push({
        id: 'seo_h1_missing',
        category: 'seo',
        title: 'No Primary H1 Heading Detected',
        status: 'warning',
        priority: 'medium',
        testMethod: 'static_html_analysis',
        confidence: 'high',
        explanation: 'The static HTML document does not contain an <h1> heading tag.',
        evidence: 'Count of <h1> elements in static HTML: 0',
        whyItMatters: 'An H1 heading provides semantic focus for both human readers and search indexers.',
        recommendation: 'Add a top-level <h1> heading near the top of the main content that summarizes the page subject.'
      });
    }
  } else if (h1Count > 1) {
    findings.push({
      id: 'seo_h1_multiple',
      category: 'seo',
      title: 'Multiple H1 Headings in Initial HTML',
      status: 'warning',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: `Found ${h1Count} separate <h1> tags in the initial HTML document.`,
      evidence: `H1 tags detected: ${h1Texts.slice(0, 3).map(t => `"${t}"`).join(', ')}${h1Count > 3 ? '...' : ''}`,
      whyItMatters: 'While HTML5 permits multiple H1s, maintaining a single main H1 preserves an intuitive heading hierarchy for accessibility screen readers.',
      recommendation: 'Reserve <h1> for the page title and demote sub-section headings to <h2> and <h3>.'
    });
  } else {
    findings.push({
      id: 'seo_h1_passed',
      category: 'seo',
      title: 'Clear Primary H1 Heading Present',
      status: 'passed',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'Exactly one primary <h1> heading was discovered in the document.',
      evidence: `H1: "${h1Texts[0] || 'Present'}"`,
      whyItMatters: 'Provides unambiguous semantic focus for both human readers and search indexers.',
      recommendation: 'Ensure your H1 aligns closely with your page title and user intent.'
    });
  }

  // 4. Canonical Tag
  const canonicalHref = $('link[rel="canonical" i]').attr('href')?.trim() || '';
  if (!canonicalHref) {
    findings.push({
      id: 'seo_canonical_missing',
      category: 'seo',
      title: 'No Canonical URL Specified in Initial HTML',
      status: 'warning',
      priority: 'medium',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'The page lacks a canonical link tag (<link rel="canonical" href="...">).',
      evidence: 'No rel="canonical" link found in initial server HTML.',
      whyItMatters: 'Without canonical tags, search engines may split ranking signals across URL variations (e.g. tracking parameters or protocol variations).',
      recommendation: `Add <link rel="canonical" href="${meta.finalUrl || meta.targetUrl}"> in the <head> to consolidate ranking signals.`
    });
  } else {
    findings.push({
      id: 'seo_canonical_present',
      category: 'seo',
      title: 'Canonical Tag Implemented',
      status: 'passed',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'The page explicitly declares its authoritative URL.',
      evidence: `Canonical URL: ${canonicalHref}`,
      whyItMatters: 'Consolidates search indexing metrics and prevents duplicate URL issues.',
      recommendation: 'Verify the canonical points to the preferred URL format.'
    });
  }

  // 5. Open Graph & Social Sharing
  const ogTitle = $('meta[property="og:title" i]').attr('content') || '';
  const ogImage = $('meta[property="og:image" i]').attr('content') || '';
  const ogDesc = $('meta[property="og:description" i]').attr('content') || '';
  const hasOpenGraph = Boolean(ogTitle || ogImage || ogDesc);
  const twitterCard = $('meta[name="twitter:card" i]').attr('content') || '';

  if (!hasOpenGraph && !twitterCard) {
    findings.push({
      id: 'seo_og_missing',
      category: 'seo',
      title: 'No Social Sharing Metadata in Initial HTML',
      status: 'warning',
      priority: 'medium',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'No Open Graph (og:title, og:image) or Twitter Card tags were detected in the document head.',
      evidence: 'Absence of Open Graph and Twitter meta tags in server HTML.',
      whyItMatters: 'When links are shared on LinkedIn, Slack, X, or messaging platforms, previews may be plain text URLs rather than formatted cards.',
      recommendation: 'Add og:title, og:description, and og:image tags to format social shares.'
    });
  } else {
    findings.push({
      id: 'seo_og_passed',
      category: 'seo',
      title: 'Social Sharing Metadata Detected',
      status: 'passed',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'Open Graph or Twitter meta tags are present for rich link previews.',
      evidence: `og:title: "${ogTitle || 'present'}", og:image: ${ogImage ? 'present' : 'absent'}, twitter:card: ${twitterCard || 'absent'}`,
      whyItMatters: 'Ensures formatted preview cards across social media and chat apps.',
      recommendation: 'Ensure preview images are high-resolution (1200x630px recommended).'
    });
  }

  // 6. Robots Directives
  const robotsMeta = $('meta[name="robots" i]').attr('content')?.toLowerCase() || '';
  const hasRobotsMeta = Boolean(robotsMeta);
  if (robotsMeta.includes('noindex')) {
    findings.push({
      id: 'seo_robots_noindex',
      category: 'seo',
      title: '"noindex" Directive Active in HTML',
      status: 'failed',
      priority: 'critical',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'The page has a robots meta tag instructing search engines NOT to index it.',
      evidence: `<meta name="robots" content="${robotsMeta}">`,
      whyItMatters: 'This directive instructs search engine crawlers to omit this page from search results.',
      recommendation: 'If this page is intended for public search traffic, remove "noindex" from the robots meta tag.'
    });
  } else {
    findings.push({
      id: 'seo_robots_indexable',
      category: 'seo',
      title: 'Page is Indexable by Crawlers',
      status: 'passed',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'No blocking "noindex" directives were detected on this page.',
      evidence: robotsMeta ? `Robots tag: "${robotsMeta}"` : 'Default indexing permitted (no blocking robots tag found).',
      whyItMatters: 'Allows search engine web crawlers to discover and index this page.',
      recommendation: 'Maintain a clean robots.txt and sitemap.xml to streamline crawl budgets.'
    });
  }

  // 7. Structured Data (Schema.org / JSON-LD / Microdata / RDFa)
  const jsonLdScripts = $('script[type="application/ld+json"]');
  const microdataItems = $('[itemscope]');
  const hasStructuredData = jsonLdScripts.length > 0 || microdataItems.length > 0;
  const structuredDataType = jsonLdScripts.length > 0 ? 'JSON-LD' : (microdataItems.length > 0 ? 'Microdata' : '');

  if (!hasStructuredData) {
    findings.push({
      id: 'seo_schema_missing',
      category: 'seo',
      title: 'No Structured Data Detected in Initial HTML',
      status: 'warning',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'No JSON-LD (<script type="application/ld+json">) or Microdata tags were found in the initial HTML.',
      evidence: '0 structured data blocks discovered in server HTML.',
      whyItMatters: 'Schema markup helps search engines understand entities (Organization, Product, Article, VideoObject) and can enable rich search snippets.',
      recommendation: 'Implement JSON-LD Schema (e.g. WebSite, Organization, or VideoObject) to enrich search result appearance.'
    });
  } else {
    findings.push({
      id: 'seo_schema_passed',
      category: 'seo',
      title: `Structured Data (${structuredDataType}) Detected`,
      status: 'passed',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: `Found ${jsonLdScripts.length} JSON-LD block(s) and ${microdataItems.length} Microdata element(s).`,
      evidence: `${structuredDataType} markup present in HTML markup.`,
      whyItMatters: 'Enables rich search snippets and helps search engines understand page entities.',
      recommendation: 'Verify schema with the Schema.org validator or Google Rich Results Test.'
    });
  }

  // TECHNICAL & SECURITY
  // 8. HTTPS Protocol
  const isHttps = urlObj.protocol === 'https:';
  if (!isHttps) {
    findings.push({
      id: 'tech_https_missing',
      category: 'technical',
      title: 'Insecure Protocol (HTTP)',
      status: 'failed',
      priority: 'critical',
      testMethod: 'http_header_inspection',
      confidence: 'high',
      explanation: 'The website is served over unencrypted HTTP rather than HTTPS.',
      evidence: `Protocol used: ${urlObj.protocol}`,
      whyItMatters: 'Browsers flag HTTP sites as "Not Secure". Passwords and data are vulnerable to interception.',
      recommendation: 'Deploy an SSL/TLS certificate and configure an HTTP-to-HTTPS redirect.'
    });
  } else {
    findings.push({
      id: 'tech_https_passed',
      category: 'technical',
      title: 'Encrypted Connection (HTTPS)',
      status: 'passed',
      priority: 'low',
      testMethod: 'http_header_inspection',
      confidence: 'high',
      explanation: 'The webpage is transmitted over secure TLS encryption.',
      evidence: `Final protocol: ${urlObj.protocol}`,
      whyItMatters: 'Protects user data in transit and meets modern web browser standards.',
      recommendation: 'Ensure all subdomains and linked static assets also load securely over HTTPS.'
    });
  }

  // 9. HTTP Security Headers
  const hsts = Boolean(meta.headers['strict-transport-security']);
  const csp = Boolean(meta.headers['content-security-policy']);
  const xfo = Boolean(meta.headers['x-frame-options']);
  const xcto = Boolean(meta.headers['x-content-type-options']);
  const referrerPolicy = Boolean(meta.headers['referrer-policy']);

  if (!hsts && isHttps) {
    findings.push({
      id: 'tech_hsts_missing',
      category: 'technical',
      title: 'Missing HSTS (Strict-Transport-Security)',
      status: 'warning',
      priority: 'medium',
      testMethod: 'http_header_inspection',
      confidence: 'high',
      explanation: 'The server response does not include the Strict-Transport-Security header.',
      evidence: 'Header Strict-Transport-Security not returned in HTTP response.',
      whyItMatters: 'HSTS instructs browsers to always connect via HTTPS, preventing downgrade attacks.',
      recommendation: 'Add header: Strict-Transport-Security: max-age=31536000; includeSubDomains'
    });
  } else if (hsts) {
    findings.push({
      id: 'tech_hsts_passed',
      category: 'technical',
      title: 'HSTS Header Active',
      status: 'passed',
      priority: 'low',
      testMethod: 'http_header_inspection',
      confidence: 'high',
      explanation: 'Strict-Transport-Security header is sent by the server.',
      evidence: `Header: Strict-Transport-Security: ${meta.headers['strict-transport-security']}`,
      whyItMatters: 'Enforces HTTPS for all client sessions.',
      recommendation: 'Ensure max-age is set to at least 1 year (31536000 seconds).'
    });
  }

  if (!xfo && !csp) {
    findings.push({
      id: 'tech_clickjacking_risk',
      category: 'technical',
      title: 'Clickjacking Protection Header Missing',
      status: 'warning',
      priority: 'medium',
      testMethod: 'http_header_inspection',
      confidence: 'high',
      explanation: 'Neither X-Frame-Options nor Content-Security-Policy frame-ancestors is present.',
      evidence: 'Headers X-Frame-Options and Content-Security-Policy absent.',
      whyItMatters: 'Malicious external sites may embed your website in an invisible iframe to perform UI redressing.',
      recommendation: 'Set "X-Frame-Options: SAMEORIGIN" or CSP "frame-ancestors \'self\'".'
    });
  } else {
    findings.push({
      id: 'tech_clickjacking_passed',
      category: 'technical',
      title: 'Clickjacking Protection Configured',
      status: 'passed',
      priority: 'low',
      testMethod: 'http_header_inspection',
      confidence: 'high',
      explanation: 'The server response restricts unauthorized iframe embedding.',
      evidence: xfo ? `X-Frame-Options: ${meta.headers['x-frame-options']}` : 'CSP frame protection present',
      whyItMatters: 'Mitigates UI redressing and clickjacking vulnerabilities.',
      recommendation: 'Maintain strict frame-ancestors definitions across all authenticated routes.'
    });
  }

  if (!xcto) {
    findings.push({
      id: 'tech_xcto_missing',
      category: 'technical',
      title: 'Missing X-Content-Type-Options Header',
      status: 'warning',
      priority: 'low',
      testMethod: 'http_header_inspection',
      confidence: 'high',
      explanation: 'Header "X-Content-Type-Options: nosniff" is absent in server response.',
      evidence: 'Header X-Content-Type-Options is not returned by the server.',
      whyItMatters: 'Prevents MIME-type sniffing where browsers execute files misdeclared by the server as scripts.',
      recommendation: 'Configure your web server or CDN to send "X-Content-Type-Options: nosniff".'
    });
  } else {
    findings.push({
      id: 'tech_xcto_passed',
      category: 'technical',
      title: 'MIME-Sniffing Prevention Enabled',
      status: 'passed',
      priority: 'low',
      testMethod: 'http_header_inspection',
      confidence: 'high',
      explanation: 'The server sends X-Content-Type-Options: nosniff.',
      evidence: `X-Content-Type-Options: ${meta.headers['x-content-type-options']}`,
      whyItMatters: 'Prevents browser MIME-type confusion attacks.',
      recommendation: 'Keep header active on all static and dynamic responses.'
    });
  }

  // 10. Charset Declaration: Check Meta AND HTTP Response Header (Standards Compliant)
  const metaCharset = $('meta[charset]').attr('charset')?.trim();
  const metaHttpEquiv = $('meta[http-equiv="content-type" i]').attr('content')?.trim();
  const headerContentType = meta.headers['content-type'] || '';
  const headerHasCharset = /charset\s*=\s*['"]?([a-zA-Z0-9_-]+)/i.test(headerContentType);
  const headerCharsetMatch = headerContentType.match(/charset\s*=\s*['"]?([a-zA-Z0-9_-]+)/i);

  if (metaCharset || metaHttpEquiv || headerHasCharset) {
    const charsetDeclaration = metaCharset 
      ? `<meta charset="${metaCharset}">` 
      : (headerHasCharset ? `HTTP Header "content-type: ${headerContentType}"` : `<meta http-equiv: "${metaHttpEquiv}">`);
    
    findings.push({
      id: 'tech_charset_passed',
      category: 'technical',
      title: 'Character Encoding Explicitly Declared',
      status: 'passed',
      priority: 'low',
      testMethod: headerHasCharset ? 'http_header_inspection' : 'static_html_analysis',
      confidence: 'high',
      explanation: 'Character encoding is explicitly declared in accordance with W3C and HTTP specifications.',
      evidence: `Declared via ${charsetDeclaration}`,
      whyItMatters: 'Ensures correct international text rendering and prevents character encoding sniffing vulnerabilities.',
      recommendation: 'Always declare UTF-8 in HTTP headers or as an early <meta charset="UTF-8"> tag.'
    });
  } else {
    findings.push({
      id: 'tech_charset_missing',
      category: 'technical',
      title: 'Character Encoding Not Declared',
      status: 'warning',
      priority: 'medium',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'Neither <meta charset> nor an HTTP Content-Type header charset parameter was detected.',
      evidence: 'No charset declared in HTML <head> or HTTP headers.',
      whyItMatters: 'Without an explicit charset declaration, browsers must infer encoding, risking garbled text or cross-site scripting risks.',
      recommendation: 'Add <meta charset="UTF-8"> as the first element in <head> or specify charset=utf-8 in the HTTP Content-Type header.'
    });
  }

  // ACCESSIBILITY & STRUCTURE
  // 11. HTML lang attribute
  const htmlLang = $('html').attr('lang')?.trim() || '';
  if (!htmlLang) {
    findings.push({
      id: 'a11y_lang_missing',
      category: 'accessibility',
      title: 'Missing HTML Language Attribute',
      status: 'failed',
      priority: 'high',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'The <html> element does not specify a lang attribute (e.g. <html lang="en">).',
      evidence: '<html> tag lacks a lang="..." attribute in initial HTML.',
      whyItMatters: 'Screen readers use the lang attribute to choose the correct voice synthesizer, pronounciation rules, and accent.',
      recommendation: 'Specify the primary page language on the root element, for example: <html lang="en">.'
    });
  } else {
    findings.push({
      id: 'a11y_lang_passed',
      category: 'accessibility',
      title: 'HTML Language Attribute Defined',
      status: 'passed',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: `The root HTML tag specifies lang="${htmlLang}".`,
      evidence: `<html lang="${htmlLang}">`,
      whyItMatters: 'Enables assistive speech synthesizers to interpret text with correct phonetics.',
      recommendation: 'Ensure sub-sections in foreign languages use inline lang attributes when applicable.'
    });
  }

  // 12. Viewport Meta Tag - Distinguishing static vs dynamic
  const viewportTag = $('meta[name="viewport" i]').attr('content')?.trim() || '';
  if (!viewportTag) {
    if (isClientRendered) {
      findings.push({
        id: 'a11y_viewport_inconclusive',
        category: 'accessibility',
        title: 'Viewport Tag Inconclusive (Client-Rendered App)',
        status: 'inconclusive',
        priority: 'medium',
        testMethod: 'static_html_analysis',
        confidence: 'medium',
        explanation: 'Viewport meta tag was not detected in initial server HTML, but dynamic client application shell markers were found. Single page applications and web components may configure viewport and responsive attributes dynamically at runtime.',
        evidence: `No <meta name="viewport"> in initial server HTML. Client app markers: ${markers.slice(0, 2).join('; ')}`,
        whyItMatters: 'Static HTML inspection cannot observe viewport tags added dynamically by client JavaScript.',
        recommendation: 'Verify in source code that a standard <meta name="viewport" content="width=device-width, initial-scale=1.0"> is included in the base HTML shell.'
      });
    } else {
      findings.push({
        id: 'a11y_viewport_missing',
        category: 'accessibility',
        title: 'Missing Viewport Meta Tag',
        status: 'failed',
        priority: 'high',
        testMethod: 'static_html_analysis',
        confidence: 'high',
        explanation: 'No viewport meta tag was found in the document head.',
        evidence: '<meta name="viewport"> is absent from initial server HTML.',
        whyItMatters: 'Mobile devices render pages without viewport tags at desktop resolution (often 980px wide), resulting in tiny text.',
        recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1.0"> in the <head>.'
      });
    }
  } else if (viewportTag.includes('user-scalable=no') || viewportTag.includes('maximum-scale=1')) {
    findings.push({
      id: 'a11y_viewport_pinch_disabled',
      category: 'accessibility',
      title: 'Viewport Restricts User Zoom/Pinch',
      status: 'warning',
      priority: 'medium',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'The viewport meta tag restricts user zooming (user-scalable=no or maximum-scale=1).',
      evidence: `Viewport content: "${viewportTag}"`,
      whyItMatters: 'WCAG 2.1 accessibility guidelines advise allowing users with low vision to enlarge text up to 200%.',
      recommendation: 'Remove user-scalable=no and maximum-scale limits so all users can zoom freely on mobile screens.'
    });
  } else {
    findings.push({
      id: 'a11y_viewport_passed',
      category: 'accessibility',
      title: 'Responsive Viewport Meta Tag Configured',
      status: 'passed',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'Responsive viewport meta tag is properly set with zoom enabled.',
      evidence: `Viewport: "${viewportTag}"`,
      whyItMatters: 'Ensures correct scale on mobile devices while allowing assistive pinch-to-zoom.',
      recommendation: 'Maintain standard width=device-width, initial-scale=1.0 configuration.'
    });
  }

  // 13. Image Alt Attributes
  const allImages = $('img');
  const imagesCount = allImages.length;
  let missingAltCount = 0;
  const sampleMissingImages: string[] = [];

  allImages.each((_, el) => {
    const alt = $(el).attr('alt');
    if (alt === undefined || alt === null) {
      missingAltCount++;
      const src = $(el).attr('src') || $(el).attr('data-src') || 'image';
      if (sampleMissingImages.length < 3) {
        sampleMissingImages.push(src.substring(0, 50));
      }
    }
  });

  if (imagesCount === 0) {
    findings.push({
      id: 'a11y_images_none',
      category: 'accessibility',
      title: 'No <img> Elements in Initial HTML',
      status: 'passed',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: isClientRendered
        ? 'No static <img> tags were detected in the initial HTML; imagery is likely rendered dynamically by client components.'
        : 'No <img> elements found in the initial HTML markup.',
      evidence: 'Static <img> count: 0',
      whyItMatters: 'No missing alt tag penalties apply.',
      recommendation: 'When adding imagery, ensure all informative images include descriptive alt text.'
    });
  } else if (missingAltCount > 0) {
    findings.push({
      id: 'a11y_images_missing_alt',
      category: 'accessibility',
      title: `${missingAltCount} Image(s) Missing Alt Text`,
      status: 'failed',
      priority: missingAltCount > 3 ? 'high' : 'medium',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: `${missingAltCount} of ${imagesCount} images lack an alt attribute entirely in initial HTML.`,
      evidence: `Samples without alt: ${sampleMissingImages.join(', ')}`,
      whyItMatters: 'Screen readers read raw filenames to visually impaired users, degrading accessibility.',
      recommendation: 'Add meaningful alt descriptions to informative images, or alt="" for purely decorative graphics.'
    });
  } else {
    findings.push({
      id: 'a11y_images_alt_passed',
      category: 'accessibility',
      title: 'All Initial Images Contain Alt Attributes',
      status: 'passed',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: `All ${imagesCount} image(s) have an alt attribute present.`,
      evidence: `${imagesCount}/${imagesCount} static images contain alt attributes.`,
      whyItMatters: 'Ensures screen readers can describe imagery to visually impaired users.',
      recommendation: 'Maintain contextually descriptive alt descriptions.'
    });
  }

  // 14. Interactive Buttons Accessible Names
  const buttons = $('button');
  let emptyButtonCount = 0;
  buttons.each((_, el) => {
    const text = $(el).text().trim();
    const ariaLabel = $(el).attr('aria-label') || $(el).attr('aria-labelledby');
    const titleAttr = $(el).attr('title');
    if (!text && !ariaLabel && !titleAttr) {
      emptyButtonCount++;
    }
  });

  if (emptyButtonCount > 0) {
    findings.push({
      id: 'a11y_empty_buttons',
      category: 'accessibility',
      title: `${emptyButtonCount} Button(s) Without Accessible Names`,
      status: 'warning',
      priority: 'medium',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'Found buttons containing only icons or empty tags with no textual name or aria-label.',
      evidence: `${emptyButtonCount} static button element(s) without inner text or aria-label.`,
      whyItMatters: 'Screen reader users will only hear "button" without knowing the action performed upon activation.',
      recommendation: 'Add aria-label="Action description" to icon-only buttons.'
    });
  } else if (buttons.length > 0) {
    findings.push({
      id: 'a11y_buttons_passed',
      category: 'accessibility',
      title: 'Interactive Buttons Have Accessible Labels',
      status: 'passed',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'All detected button elements have accessible text or aria labels.',
      evidence: `Checked ${buttons.length} button(s) in initial HTML.`,
      whyItMatters: 'Screen readers can announce button actions to users.',
      recommendation: 'Ensure keyboard focus indicators remain visible when tabbing through buttons.'
    });
  }

  // PERFORMANCE & RESOURCE OBSERVATIONS
  // 15. Server Response Latency (Time to First Response)
  if (meta.fetchTimeMs > 2500) {
    findings.push({
      id: 'perf_ttfb_slow',
      category: 'performance',
      title: 'Slow Server Response Latency (Time to First Response)',
      status: 'failed',
      priority: 'high',
      testMethod: 'http_header_inspection',
      confidence: 'high',
      explanation: `Initial HTML server response took ${meta.fetchTimeMs}ms, exceeding the recommended 800ms threshold. This measures server response latency (time to first response), not overall page rendering or asset completion.`,
      evidence: `Server response time: ${meta.fetchTimeMs}ms (HTTP ${meta.httpStatus})`,
      whyItMatters: 'A slow server response delays all subsequent resource downloads.',
      recommendation: 'Implement server caching, edge CDNs, and optimize database queries.'
    });
  } else if (meta.fetchTimeMs > 1000) {
    findings.push({
      id: 'perf_ttfb_moderate',
      category: 'performance',
      title: 'Moderate Server Response Latency (Time to First Response)',
      status: 'warning',
      priority: 'medium',
      testMethod: 'http_header_inspection',
      confidence: 'high',
      explanation: `Initial server response took ${meta.fetchTimeMs}ms. Recommended threshold is under 800ms. This measures server response latency (time to first response), not overall page rendering or asset completion.`,
      evidence: `Server response time: ${meta.fetchTimeMs}ms (HTTP ${meta.httpStatus})`,
      whyItMatters: 'Higher latency delays screen rendering.',
      recommendation: 'Leverage edge caching and verify host server proximity.'
    });
  } else {
    findings.push({
      id: 'perf_ttfb_fast',
      category: 'performance',
      title: 'Fast Initial Server Response Time (Time to First Response)',
      status: 'passed',
      priority: 'low',
      testMethod: 'http_header_inspection',
      confidence: 'high',
      explanation: `Initial HTML document delivered in ${meta.fetchTimeMs}ms. This measures server response latency (time to first response), not overall page rendering or asset completion.`,
      evidence: `Server response time: ${meta.fetchTimeMs}ms (HTTP ${meta.httpStatus})`,
      whyItMatters: 'Quick server responses accelerate First Contentful Paint.',
      recommendation: 'Maintain server performance under high concurrent loads.'
    });
  }

  // 16. HTML Payload Size
  const htmlSizeKb = Math.round(meta.contentLengthBytes / 1024);
  if (meta.contentLengthBytes > 400 * 1024) {
    findings.push({
      id: 'perf_html_size_large',
      category: 'performance',
      title: 'Large Initial HTML Document Size',
      status: 'warning',
      priority: 'medium',
      testMethod: 'http_header_inspection',
      confidence: 'high',
      explanation: `HTML document payload is ${htmlSizeKb}KB. Ideal initial HTML size is under 150-200KB.`,
      evidence: `Payload size: ${htmlSizeKb}KB (${meta.contentLengthBytes} bytes)`,
      whyItMatters: 'Large initial HTML payloads consume mobile bandwidth and increase DOM parsing duration.',
      recommendation: 'Avoid massive inline base64 assets or large serialized JSON blocks in initial HTML.'
    });
  } else {
    findings.push({
      id: 'perf_html_size_passed',
      category: 'performance',
      title: 'Compact HTML Document Payload',
      status: 'passed',
      priority: 'low',
      testMethod: 'http_header_inspection',
      confidence: 'high',
      explanation: `HTML document size is lightweight at ${htmlSizeKb}KB.`,
      evidence: `Payload size: ${htmlSizeKb}KB`,
      whyItMatters: 'Small HTML payloads download and parse quickly across mobile connections.',
      recommendation: 'Ensure Gzip or Brotli compression remains active on server responses.'
    });
  }

  // 17. Render-Blocking External Scripts
  const scripts = $('script[src]');
  const scriptCount = scripts.length;
  let blockingScriptCount = 0;
  scripts.each((_, el) => {
    const isAsync = $(el).attr('async') !== undefined;
    const isDefer = $(el).attr('defer') !== undefined;
    const isModule = $(el).attr('type') === 'module';
    if (!isAsync && !isDefer && !isModule) {
      blockingScriptCount++;
    }
  });

  if (blockingScriptCount > 3) {
    findings.push({
      id: 'perf_scripts_blocking',
      category: 'performance',
      title: `${blockingScriptCount} Render-Blocking Scripts in Head/Body`,
      status: 'warning',
      priority: 'medium',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: `Found ${blockingScriptCount} external scripts without defer, async, or type="module" attributes.`,
      evidence: `${blockingScriptCount} of ${scriptCount} external scripts are synchronous.`,
      whyItMatters: 'Browsers halt HTML parsing and rendering when encountering synchronous scripts.',
      recommendation: 'Add defer or async to non-critical external scripts.'
    });
  } else {
    findings.push({
      id: 'perf_scripts_passed',
      category: 'performance',
      title: 'Scripts Configured Asynchronously / Deferred',
      status: 'passed',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'External scripts use deferred, asynchronous, or ES module loading.',
      evidence: `${blockingScriptCount} synchronous blocking script(s) detected.`,
      whyItMatters: 'Prevents parser blocking during initial page rendering.',
      recommendation: 'Audit third-party scripts periodically to prevent dependency bloat.'
    });
  }

  // 18. Core Web Vitals (INP, LCP, CLS) - Technical Honesty Rule
  findings.push({
    id: 'perf_cwv_untested',
    category: 'performance',
    title: 'Core Web Vitals (INP, LCP, CLS) — Browser Execution Required',
    status: 'not_tested',
    priority: 'low',
    testMethod: 'not_tested',
    confidence: 'high',
    explanation: 'HTTP response time alone is not a measurement of real browser performance or Core Web Vitals. Real CWV measurements require live user telemetry (Chrome UX Report) or a headful Chromium browser rendering engine.',
    evidence: 'Static HTTP audit performed; synthetic browser rendering engine not executed.',
    whyItMatters: 'WebX-Ray adheres to technical honesty: we do not fabricate Core Web Vitals scores without genuine browser rendering measurements.',
    recommendation: 'Consult Google PageSpeed Insights or Google Search Console for real-user field telemetry.'
  });

  // USABILITY & CONVERSION SIGNALS
  // 19. Semantic Navigation Landmark
  const navElements = $('nav, [role="navigation"]');
  if (navElements.length === 0) {
    if (isClientRendered) {
      findings.push({
        id: 'usability_nav_inconclusive',
        category: 'usability',
        title: 'Navigation Landmark Inconclusive (Client-Rendered App)',
        status: 'inconclusive',
        priority: 'low',
        testMethod: 'static_html_analysis',
        confidence: 'medium',
        explanation: 'No semantic <nav> landmark was present in initial server HTML. Single page applications routinely render top-level menus and navigation drawers through client-side component trees.',
        evidence: `No static <nav> tags found. Client app shell detected: ${markers.slice(0, 2).join('; ')}`,
        whyItMatters: 'Cannot definitively verify navigation landmark absence from initial HTML in dynamic applications.',
        recommendation: 'Ensure top-level menus in client components use semantic <nav aria-label="Main"> elements.'
      });
    } else {
      findings.push({
        id: 'usability_nav_missing',
        category: 'usability',
        title: 'No Semantic Navigation Landmark (<nav>)',
        status: 'warning',
        priority: 'low',
        testMethod: 'static_html_analysis',
        confidence: 'medium',
        explanation: 'No semantic <nav> element or role="navigation" container found in static markup.',
        evidence: 'Count of <nav> elements in HTML: 0',
        whyItMatters: 'Semantic navigation landmarks allow screen reader users to jump directly to menu sections.',
        recommendation: 'Wrap top-level site menus in a <nav aria-label="Main Navigation"> element.'
      });
    }
  } else {
    findings.push({
      id: 'usability_nav_passed',
      category: 'usability',
      title: 'Semantic Navigation Landmark Present',
      status: 'passed',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'The webpage contains semantic <nav> landmarks in markup.',
      evidence: `Found ${navElements.length} semantic navigation container(s).`,
      whyItMatters: 'Enhances accessibility for keyboard and screen-reader users.',
      recommendation: 'Ensure mobile navigation menus are accessible via keyboard Tab controls.'
    });
  }

  // 20. Favicon presence
  const hasFavicon = $('link[rel*="icon" i]').length > 0;
  if (!hasFavicon) {
    findings.push({
      id: 'usability_favicon_missing',
      category: 'usability',
      title: 'No Favicon Tag in Initial HTML',
      status: 'warning',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'No <link rel="icon"> tag was detected in the document head.',
      evidence: 'No link rel="icon" declared in HTML.',
      whyItMatters: 'Without a favicon, browser tabs show a generic globe, making tabs harder to find.',
      recommendation: 'Add a high-resolution favicon in <head>.'
    });
  } else {
    findings.push({
      id: 'usability_favicon_passed',
      category: 'usability',
      title: 'Favicon Configured',
      status: 'passed',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: 'Website favicon link is declared in the document head.',
      evidence: 'Favicon link tag found in <head>.',
      whyItMatters: 'Strengthens brand recognition across open browser tabs and bookmarks.',
      recommendation: 'Include modern SVG and Apple Touch Icon variants.'
    });
  }

  // 21. Call to Action (CTA) Detection
  const links = $('a');
  let ctaFound = false;
  let ctaTextSample = '';
  const ctaRegex = /(get started|sign up|sign in|try for free|contact us|contact|book a demo|request demo|buy now|start free trial|join now|subscribe|schedule|get a quote|watch now|explore|sign in)/i;

  links.each((_, el) => {
    const text = $(el).text().trim();
    if (ctaRegex.test(text) && !ctaFound) {
      ctaFound = true;
      ctaTextSample = text;
    }
  });

  buttons.each((_, el) => {
    const text = $(el).text().trim();
    if (ctaRegex.test(text) && !ctaFound) {
      ctaFound = true;
      ctaTextSample = text;
    }
  });

  if (!ctaFound) {
    if (isClientRendered) {
      findings.push({
        id: 'usability_cta_inconclusive',
        category: 'usability',
        title: 'Call-to-Action Inconclusive in Initial HTML',
        status: 'inconclusive',
        priority: 'low',
        testMethod: 'static_html_analysis',
        confidence: 'medium',
        explanation: 'Did not detect high-intent conversion verbs in initial HTML. Dynamic applications typically mount buttons via client components.',
        evidence: `No common action verbs in static markup. Dynamic app shell detected.`,
        whyItMatters: 'Initial server payload may only contain the application container.',
        recommendation: 'Ensure prominent calls to action remain visible above the fold.'
      });
    } else {
      findings.push({
        id: 'usability_cta_missing',
        category: 'usability',
        title: 'No Prominent Call-to-Action (CTA) in Static HTML',
        status: 'warning',
        priority: 'medium',
        testMethod: 'static_html_analysis',
        confidence: 'high',
        explanation: 'Did not detect recognizable action-oriented copy such as "Get Started", "Sign Up", or "Contact Us".',
        evidence: 'No anchor or button text matching common conversion verbs.',
        whyItMatters: 'Clear conversion paths guide visitor action.',
        recommendation: 'Position a clear primary call to action button above the fold.'
      });
    }
  } else {
    findings.push({
      id: 'usability_cta_passed',
      category: 'usability',
      title: 'Action-Oriented Conversion Prompt Detected',
      status: 'passed',
      priority: 'low',
      testMethod: 'static_html_analysis',
      confidence: 'high',
      explanation: `Found recognizable action-oriented prompt: "${ctaTextSample}".`,
      evidence: `Action copy found: "${ctaTextSample}"`,
      whyItMatters: 'Directs visitor attention toward core user flows.',
      recommendation: 'Ensure CTA placement and contrast stand out clearly against background colors.'
    });
  }

  // 22. Mobile Touch Target Accuracy - Not Tested
  findings.push({
    id: 'usability_touch_untested',
    category: 'usability',
    title: 'Physical Touch Target Spacing & Viewport Rendering',
    status: 'not_tested',
    priority: 'low',
    testMethod: 'not_tested',
    confidence: 'high',
    explanation: 'Static HTML inspection cannot calculate physical tap target dimensions (minimum 48x48px) or pixel rendering without a browser viewport engine.',
    evidence: 'Static HTTP audit performed; headless touch engine not executed.',
    whyItMatters: 'WebX-Ray reports only verified data: physical touch targets require live browser layout measurement.',
    recommendation: 'Manually test navigation and form submit buttons on physical mobile devices.'
  });

  // Category Scoring - Excluding Not Tested and Inconclusive from Denominator
  const calculateCategoryScore = (category: Finding['category']): CategoryScore => {
    const items = findings.filter(f => f.category === category);
    const passed = items.filter(f => f.status === 'passed').length;
    const warning = items.filter(f => f.status === 'warning').length;
    const failed = items.filter(f => f.status === 'failed').length;
    const notTested = items.filter(f => f.status === 'not_tested').length;
    const inconclusive = items.filter(f => f.status === 'inconclusive').length;

    // Denominator consists exclusively of applicable, completed checks!
    const applicableCount = passed + warning + failed;
    if (applicableCount === 0) {
      return { score: null, passed, warning, failed, notTested, inconclusive, applicableCount: 0 };
    }

    const rawScore = ((passed * 1.0) + (warning * 0.5)) / applicableCount * 100;
    return {
      score: Math.round(rawScore),
      passed,
      warning,
      failed,
      notTested,
      inconclusive,
      applicableCount
    };
  };

  const categories = {
    seo: calculateCategoryScore('seo'),
    technical: calculateCategoryScore('technical'),
    accessibility: calculateCategoryScore('accessibility'),
    performance: calculateCategoryScore('performance'),
    usability: calculateCategoryScore('usability')
  };

  // Weighted Overall Score (only from categories with applicable checks)
  const categoryWeights: Record<keyof typeof categories, number> = {
    seo: 0.25,
    technical: 0.25,
    accessibility: 0.20,
    performance: 0.15,
    usability: 0.15
  };

  let totalWeightedScore = 0;
  let totalActiveWeight = 0;

  for (const [catKey, catScore] of Object.entries(categories) as [keyof typeof categories, CategoryScore][]) {
    if (catScore.applicableCount > 0 && catScore.score !== null) {
      const weight = categoryWeights[catKey];
      totalWeightedScore += catScore.score * weight;
      totalActiveWeight += weight;
    }
  }

  const overallScore = totalActiveWeight > 0 
    ? Math.round(totalWeightedScore / totalActiveWeight)
    : null;

  return {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    url: meta.targetUrl,
    finalUrl: meta.finalUrl || meta.targetUrl,
    domain,
    timestamp: new Date().toISOString(),
    fetchTimeMs: meta.fetchTimeMs,
    httpStatus: meta.httpStatus,
    contentType: meta.contentType,
    contentLengthBytes: meta.contentLengthBytes,
    isClientRendered,
    clientRenderedMarkers: markers,
    auditStatus: isClientRendered ? 'partial' : 'completed',
    auditStatusReason: isClientRendered
      ? 'Initial server HTML inspected. Dynamic client-side application shell detected; in-browser JavaScript execution was not performed.'
      : 'Full initial server HTML inspection completed successfully.',
    unperformedChecks: isClientRendered
      ? ['In-browser dynamic DOM hydration', 'Client-rendered heading text and navigation menus']
      : [],
    overallScore,
    categories,
    findings,
    pageMeta: {
      title: titleTag,
      description: metaDesc,
      canonical: canonicalHref,
      h1Count,
      h1Text: h1Texts,
      h2Count,
      h3Count,
      imagesCount,
      imagesMissingAltCount: missingAltCount,
      linksCount: links.length,
      externalLinksCount: $('a[href^="http"]').filter((_, el) => !$(el).attr('href')?.includes(domain)).length,
      scriptsCount: $('script').length,
      stylesCount: $('link[rel="stylesheet"]').length,
      hasViewport: Boolean(viewportTag),
      viewportContent: viewportTag,
      hasLang: Boolean(htmlLang),
      lang: htmlLang,
      hasOpenGraph,
      hasTwitterCard: Boolean(twitterCard),
      hasFavicon,
      hasRobotsMeta,
      robotsMeta,
      hasStructuredData,
      structuredDataType
    },
    securityHeaders: {
      hasHsts: hsts,
      hasCsp: csp,
      hasXFrameOptions: xfo,
      hasXContentTypeOptions: xcto,
      hasReferrerPolicy: referrerPolicy
    },
    telemetry: {
      ipAddress: meta.ipAddress,
      serverHeader: meta.headers['server'],
      compression: meta.headers['content-encoding'],
      cacheControl: meta.headers['cache-control'],
      etag: meta.headers['etag'],
      wordCount: $('body').text().replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean).length,
      readingTimeMin: Math.max(1, Math.ceil($('body').text().replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean).length / 200)),
      headingsSummary: {
        h1: h1Texts,
        h2: h2Texts,
        h3: h3Texts
      },
      openGraphPreview: (
        $('meta[property="og:title"]').attr('content') ||
        $('meta[property="og:description"]').attr('content') ||
        $('meta[property="og:image"]').attr('content')
      ) ? {
        title: $('meta[property="og:title"]').attr('content') || $('meta[name="og:title"]').attr('content') || undefined,
        description: $('meta[property="og:description"]').attr('content') || $('meta[name="og:description"]').attr('content') || undefined,
        image: $('meta[property="og:image"]').attr('content') || $('meta[name="og:image"]').attr('content') || undefined,
        siteName: $('meta[property="og:site_name"]').attr('content') || undefined
      } : undefined
    }
  };
}

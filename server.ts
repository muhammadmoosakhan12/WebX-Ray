import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dns from 'dns';
import { promisify } from 'util';
import * as cheerio from 'cheerio';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { AuditReport, Finding } from './src/types/audit';
import { analyzeWebsite } from './src/utils/auditEngine';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dnsLookup = promisify(dns.lookup);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '2mb' }));

// Initialize Gemini SDK if API key is present
const geminiApiKey = process.env.GEMINI_API_KEY || '';
let aiClient: GoogleGenAI | null = null;
if (geminiApiKey && geminiApiKey !== 'MY_GEMINI_API_KEY') {
  try {
    aiClient = new GoogleGenAI({ apiKey: geminiApiKey });
  } catch (err) {
    console.warn('Failed to initialize GoogleGenAI client:', err);
  }
}

/**
 * SSRF & Private IP Protection
 * Checks whether an IP address or hostname is a private/internal network.
 */
function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  // IPv4 checks
  if (
    ip === '127.0.0.1' ||
    ip === '0.0.0.0' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('169.254.')
  ) {
    return true;
  }
  // 172.16.0.0 – 172.31.255.255
  if (ip.startsWith('172.')) {
    const parts = ip.split('.');
    if (parts.length >= 2) {
      const second = parseInt(parts[1], 10);
      if (second >= 16 && second <= 31) return true;
    }
  }
  // IPv6 loopback & private
  if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc00:') || ip.startsWith('fd')) {
    return true;
  }
  return false;
}

/**
 * Validates the safety of a given URL
 */
async function validateUrlSafety(inputUrl: string): Promise<{ safe: boolean; urlObj?: URL; error?: string; ipAddress?: string }> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(inputUrl);
  } catch {
    return { safe: false, error: 'Malformed or invalid URL format.' };
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { safe: false, error: 'Only HTTP and HTTPS protocols are supported.' };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost')
  ) {
    return { safe: false, error: 'Inspecting localhost or internal loopback hosts is restricted for security.' };
  }

  let resolvedIp = '';
  try {
    const lookup = await dnsLookup(hostname);
    resolvedIp = lookup.address;
    if (isPrivateIp(lookup.address)) {
      return { safe: false, error: `Resolved host IP (${lookup.address}) is within a restricted private network.` };
    }
  } catch (err: any) {
    return { safe: false, error: `Could not resolve domain name "${hostname}". Please verify the URL.` };
  }

  return { safe: true, urlObj: parsedUrl, ipAddress: resolvedIp };
}



/**
 * Deterministic fallback recommendations when Gemini AI is not configured or offline
 */
function generateDeterministicAiInsights(audit: Omit<AuditReport, 'aiAnalysis'>): AuditReport['aiAnalysis'] {
  const failedOrWarn = audit.findings.filter(f => f.status === 'failed' || f.status === 'warning');
  const criticals = failedOrWarn.filter(f => f.priority === 'critical' || f.priority === 'high');

  const topItems: Array<{
    title: string;
    impact: 'High' | 'Medium' | 'Low';
    effort: 'Low' | 'Medium' | 'High';
    description: string;
    codeExample?: string;
  }> = [];

  if (audit.pageMeta.title.length === 0 || audit.pageMeta.title.length < 20) {
    topItems.push({
      title: 'Optimize Core HTML Page Title',
      impact: 'High',
      effort: 'Low',
      description: 'The title tag is the single most critical on-page SEO signal. Craft a descriptive title combining your brand with your target solution.',
      codeExample: `<title>${audit.domain.replace(/^www\./, '')} | Fast & Reliable Services</title>`
    });
  }

  if (!audit.pageMeta.description) {
    topItems.push({
      title: 'Implement High-Converting Meta Description',
      impact: 'High',
      effort: 'Low',
      description: 'Your page currently relies on search engines picking random text snippets. Add a persuasive 150-character summary with a clear call-to-action.',
      codeExample: '<meta name="description" content="Discover top-tier solutions designed for growing businesses. Explore our features and get started with a free trial today.">'
    });
  }

  if (audit.pageMeta.imagesMissingAltCount > 0) {
    topItems.push({
      title: `Fix ${audit.pageMeta.imagesMissingAltCount} Image Alt Attributes`,
      impact: 'Medium',
      effort: 'Low',
      description: 'Missing alt tags damage screen reader accessibility and forfeit Google Image search traffic.',
      codeExample: '<img src="/hero-banner.jpg" alt="Platform overview dashboard with real-time audit metrics">'
    });
  }

  if (!audit.securityHeaders.hasHsts && audit.url.startsWith('https://')) {
    topItems.push({
      title: 'Deploy Strict-Transport-Security (HSTS)',
      impact: 'Medium',
      effort: 'Low',
      description: 'Enforce HTTPS for all connecting clients to prevent man-in-the-middle downgrade attacks.',
      codeExample: 'Strict-Transport-Security: max-age=31536000; includeSubDomains'
    });
  }

  // Ensure we always have at least 3 actionable items
  if (topItems.length < 3) {
    topItems.push({
      title: 'Strengthen Conversion Rate with Above-The-Fold CTA',
      impact: 'High',
      effort: 'Medium',
      description: 'Ensure first-time visitors immediately see a bold, high-contrast primary action button without having to scroll.',
      codeExample: '<button class="bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 px-6 rounded-lg">Get Started Free</button>'
    });
  }

  return {
    summary: `WebX-Ray evaluated ${audit.domain} with an overall health score of ${audit.overallScore ?? 'N/A'}/100. We discovered ${audit.findings.filter(f => f.status === 'passed').length} verified passing checks and ${failedOrWarn.length} opportunities for immediate enhancement across SEO, security, and user experience.`,
    executiveTakeaways: [
      criticals.length > 0
        ? `Resolve ${criticals.length} high-priority finding(s) immediately to safeguard search indexing and user trust.`
        : 'Foundational technical compliance is strong, with no critical blocking defects detected.',
      `Current SEO indexability is rated at ${audit.categories.seo.score ?? 'N/A'}%, with key focus on meta structure and headings.`,
      `Initial server response time was measured at ${audit.fetchTimeMs}ms with an HTML payload of ${Math.round(audit.contentLengthBytes / 1024)}KB.`
    ],
    topActionItems: topItems.slice(0, 4),
    copyImprovements: {
      titleSuggestion: `${audit.domain.replace(/^www\./, '').split('.')[0].toUpperCase()} | High-Performance Digital Platform`,
      descriptionSuggestion: `Discover how ${audit.domain.replace(/^www\./, '')} delivers speed, reliability, and security. Explore our features and get started today.`,
      ctaSuggestion: 'Explore Solutions & Get Started'
    },
    research: {
      businessSummary: `${audit.domain} operates an online digital destination serving users with ${audit.pageMeta.title ? `"${audit.pageMeta.title}"` : 'web content'}. Document contains ${audit.telemetry?.wordCount || 0} words with an estimated reading time of ~${audit.telemetry?.readingTimeMin || 1} min.`,
      targetAudience: `Users seeking services or information related to ${audit.domain.replace(/^www\./, '').split('.')[0]}, with high expectations for performance, security, and clean navigation.`,
      valueProposition: audit.pageMeta.title
        ? `Communicated primarily via title: "${audit.pageMeta.title}". Headline hierarchy provides ${audit.pageMeta.h1Count} primary H1 heading(s).`
        : 'Value proposition is currently implicit; adding a distinct H1 headline will significantly strengthen visitor retention.',
      searchIntent: {
        primaryIntent: audit.pageMeta.title?.toLowerCase().includes('how') || audit.pageMeta.title?.toLowerCase().includes('what') ? 'Informational' : 'Commercial / Navigation',
        targetQueries: [
          `${audit.domain.replace(/^www\./, '')}`,
          `${audit.domain.replace(/^www\./, '').split('.')[0]} platform`,
          `${audit.pageMeta.h1Text[0] || audit.domain.replace(/^www\./, '').split('.')[0]} online`,
          `best ${audit.domain.replace(/^www\./, '').split('.')[0]} solutions`
        ],
        contentGaps: [
          'Explicit FAQ section answering core visitor questions',
          'Rich structured data schema (JSON-LD Organization / WebSite) for rich search snippets'
        ]
      },
      competitiveEdge: {
        strengths: [
          `Server response latency measured at ${audit.fetchTimeMs}ms`,
          audit.securityHeaders.hasHsts ? 'HTTPS Strict-Transport-Security (HSTS) enforced' : 'Clean document structure without excessive payloads',
          `${audit.findings.filter(f => f.status === 'passed').length} verified baseline compliance checks passed`
        ],
        vulnerabilities: [
          criticals.length > 0 ? `${criticals.length} high-severity findings requiring immediate fix` : 'Missing JSON-LD structured data schema markup',
          !audit.securityHeaders.hasCsp ? 'Missing Content-Security-Policy (CSP) header' : 'Meta description length could be further optimized for click-through rate'
        ]
      },
      conversionOptimization: {
        ctaAnalysis: audit.categories.usability.score && audit.categories.usability.score >= 70
          ? 'Clear interactive elements and conversion prompts detected above and within the content outline.'
          : 'Interactive conversion triggers need higher contrast and clear primary action placement.',
        trustSignalsRating: audit.securityHeaders.hasHsts && audit.url.startsWith('https://') ? 'Strong' : 'Moderate',
        recommendations: [
          'Place a high-contrast primary action button in the top navigation and hero fold',
          'Highlight customer testimonials, security badges, and clear privacy guarantees near action points'
        ]
      },
      growthRoadmap: [
        {
          phase: 'Phase 1: Technical & SEO Foundation',
          duration: 'Days 1–7',
          focus: 'Meta tag precision, heading hierarchy, and HTTP security headers',
          actionItems: [
            'Align title and meta description with targeted high-intent search queries',
            'Enforce Strict-Transport-Security and X-Content-Type-Options headers',
            'Ensure all images have informative, keyword-relevant alt attributes'
          ]
        },
        {
          phase: 'Phase 2: UX, Speed & Conversion Funnel',
          duration: 'Days 8–20',
          focus: 'Mobile responsiveness, primary CTA placement, and visual hierarchy',
          actionItems: [
            'Test primary CTA visibility across mobile and desktop viewports',
            'Audit render-blocking scripts and enable browser caching with explicit Cache-Control headers',
            'Add trust signals and security assurances adjacent to conversion forms'
          ]
        },
        {
          phase: 'Phase 3: Organic Scaling & Search Authority',
          duration: 'Days 21–30',
          focus: 'Schema markup, internal linking graph, and content cluster expansion',
          actionItems: [
            'Deploy Schema.org Organization, WebSite, and BreadcrumbList JSON-LD structured data',
            'Expand on-page content to satisfy long-tail informational search queries',
            'Set up Google Search Console performance monitoring to track click-through rates'
          ]
        }
      ]
    }
  };
}

/**
 * Deep AI Research & Strategy generation via Gemini 3.8 Flash
 */
async function generateGeminiInsights(audit: Omit<AuditReport, 'aiAnalysis'>): Promise<AuditReport['aiAnalysis']> {
  if (!aiClient) {
    return generateDeterministicAiInsights(audit);
  }

  try {
    const findingsSummary = audit.findings
      .map(f => `[${f.status.toUpperCase()} | Priority: ${f.priority}] ${f.title}: ${f.explanation} (Evidence: ${f.evidence})`)
      .slice(0, 20)
      .join('\n');

    const prompt = `You are a Principal Website Auditor, Senior Technical SEO Strategist, and Growth Engineer at WebX-Ray.
Conduct a rigorous, deep AI research evaluation on this verified website audit.
Analyze the target website's positioning, technical posture, conversion funnel, search intent, and competitive stance.
Return ONLY a valid JSON object matching the requested schema. No markdown formatting, no backticks.

Website Telemetry & Verified Evidence:
- Target URL: ${audit.url}
- Final Resolved URL: ${audit.finalUrl}
- HTTP Status: ${audit.httpStatus}
- Server Response Time: ${audit.fetchTimeMs}ms
- Document Size: ${Math.round(audit.contentLengthBytes / 1024)}KB
- Server Header: ${audit.telemetry?.serverHeader || 'Hidden/Undisclosed'}
- Compression: ${audit.telemetry?.compression || 'Standard'}
- Server IP: ${audit.telemetry?.ipAddress || 'External'}
- Total Word Count: ${audit.telemetry?.wordCount || 0} words (~${audit.telemetry?.readingTimeMin || 1} min read)
- Page Title: "${audit.pageMeta.title}"
- Meta Description: "${audit.pageMeta.description}"
- H1 Headings (${audit.pageMeta.h1Count}): ${JSON.stringify(audit.pageMeta.h1Text)}
- Subheadings Sample: H2=${JSON.stringify(audit.telemetry?.headingsSummary?.h2?.slice(0, 5) || [])}; H3=${JSON.stringify(audit.telemetry?.headingsSummary?.h3?.slice(0, 5) || [])}
- OpenGraph: ${JSON.stringify(audit.telemetry?.openGraphPreview || {})}
- Security Headers: HSTS=${audit.securityHeaders.hasHsts}, CSP=${audit.securityHeaders.hasCsp}, X-Frame-Options=${audit.securityHeaders.hasXFrameOptions}
- Category Health Scores:
  SEO: ${audit.categories.seo.score ?? 'N/A'}%
  Technical: ${audit.categories.technical.score ?? 'N/A'}%
  Accessibility: ${audit.categories.accessibility.score ?? 'N/A'}%
  Performance: ${audit.categories.performance.score ?? 'N/A'}%
  Usability: ${audit.categories.usability.score ?? 'N/A'}
- Overall Health Score: ${audit.overallScore ?? 'N/A'}/100

Key Diagnostic Findings:
${findingsSummary}

Generate pure JSON adhering strictly to this schema:
{
  "summary": "2-3 highly incisive sentences analyzing website health, market posture, and business trajectory.",
  "executiveTakeaways": [
    "High-impact strategic takeaway 1",
    "High-impact strategic takeaway 2",
    "High-impact strategic takeaway 3"
  ],
  "topActionItems": [
    {
      "title": "Action title",
      "impact": "High",
      "effort": "Low",
      "description": "Clear rationale and specific technical fix steps.",
      "codeExample": "Concrete HTML snippet or config line"
    }
  ],
  "copyImprovements": {
    "titleSuggestion": "Punchy, high-CTR page title under 60 characters tailored for target queries",
    "descriptionSuggestion": "High-converting meta description between 135-155 characters with a compelling call-to-action",
    "ctaSuggestion": "High-intent call-to-action prompt for primary buttons"
  },
  "research": {
    "businessSummary": "Comprehensive summary of what business or service this website represents, what solutions it offers, and how effectively its core message is presented.",
    "targetAudience": "Detailed breakdown of the primary buyer persona or user audience visiting this page.",
    "valueProposition": "Critical evaluation of whether the value proposition is distinct, memorable, and communicated above the fold.",
    "searchIntent": {
      "primaryIntent": "Commercial Investigation / Informational / Transactional / Navigational",
      "targetQueries": [
        "High-intent search query 1",
        "High-intent search query 2",
        "High-intent search query 3",
        "High-intent search query 4"
      ],
      "contentGaps": [
        "Important topic or question customers search for that this page fails to answer",
        "Missing trust or proof signal"
      ]
    },
    "competitiveEdge": {
      "strengths": [
        "Concrete competitive advantage observed on this site",
        "Technical or design strength"
      ],
      "vulnerabilities": [
        "Vulnerability or defect that competitors can exploit",
        "Technical or content friction"
      ]
    },
    "conversionOptimization": {
      "ctaAnalysis": "Direct evaluation of call-to-action hierarchy, friction, and button copy.",
      "trustSignalsRating": "Strong",
      "recommendations": [
        "Conversion optimization recommendation 1",
        "Conversion optimization recommendation 2"
      ]
    },
    "growthRoadmap": [
      {
        "phase": "Phase 1: Quick Wins & Critical Compliance",
        "duration": "Days 1–7",
        "focus": "Title, metadata, heading hierarchy, and HTTPS/security headers",
        "actionItems": [
          "Specific fix step 1",
          "Specific fix step 2"
        ]
      },
      {
        "phase": "Phase 2: UX, Speed & Conversion Funnel",
        "duration": "Days 8–20",
        "focus": "Mobile navigation, CTA visibility, and asset optimization",
        "actionItems": [
          "Specific fix step 1",
          "Specific fix step 2"
        ]
      },
      {
        "phase": "Phase 3: Organic Scaling & Search Authority",
        "duration": "Days 21–30",
        "focus": "Schema.org structured data, content expansion, and link architecture",
        "actionItems": [
          "Specific fix step 1",
          "Specific fix step 2"
        ]
      }
    ]
  }
}`;

    const aiCall = aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini AI synthesis timeout')), 25000)
    );

    const response = await Promise.race([aiCall, timeoutPromise]);

    const responseText = response.text?.trim() || '';
    const cleanJson = responseText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleanJson);
    return parsed;
  } catch (err) {
    console.warn('Gemini AI generation encountered an error or timed out; falling back to deterministic insights:', err);
    return generateDeterministicAiInsights(audit);
  }
}

// API Routes

// 1. Health check & Capabilities
app.get('/api/status', (req: Request, res: Response) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    aiEnabled: Boolean(aiClient),
    timestamp: new Date().toISOString()
  });
});

// 2. Perform Website Audit
app.post('/api/audit', async (req: Request, res: Response) => {
  const { url: rawUrl, requestAi } = req.body;

  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({ error: 'Please provide a valid website URL.' });
  }

  let normalizedUrl = rawUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  // Safety & SSRF check
  const safety = await validateUrlSafety(normalizedUrl);
  if (!safety.safe || !safety.urlObj) {
    return res.status(400).json({ error: safety.error || 'The requested URL failed safety validation.' });
  }

  const startTime = Date.now();
  let fetchResponse: globalThis.Response;
  let html = '';
  const headersRecord: Record<string, string> = {};

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    fetchResponse = await fetch(safety.urlObj.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'WebX-Ray-Bot/1.0 (+https://webxray.platform/bot; Website Intelligence Auditor)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: controller.signal,
      redirect: 'follow'
    });

    clearTimeout(timeoutId);

    // Verify redirected URL is still safe
    if (fetchResponse.url && fetchResponse.url !== safety.urlObj.toString()) {
      const redirectSafety = await validateUrlSafety(fetchResponse.url);
      if (!redirectSafety.safe) {
        return res.status(400).json({ error: 'Website redirected to an unsafe or private destination.' });
      }
    }

    fetchResponse.headers.forEach((val, key) => {
      headersRecord[key.toLowerCase()] = val;
    });

    const contentType = headersRecord['content-type'] || '';
    if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return res.status(400).json({
        error: `Target returned "${contentType}" instead of HTML. WebX-Ray can only inspect web pages.`
      });
    }

    // Read response text with size limit (3MB max)
    const fullText = await fetchResponse.text();
    html = fullText.length > 3 * 1024 * 1024 ? fullText.slice(0, 3 * 1024 * 1024) : fullText;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Inspection timed out after 10 seconds. The target server took too long to respond.' });
    }
    return res.status(502).json({
      error: `Failed to inspect "${safety.urlObj.hostname}". Connection error: ${err.message || 'Host unreachable'}`
    });
  }

  const fetchDuration = Date.now() - startTime;
  const finalUrl = fetchResponse.url || safety.urlObj.toString();
  const contentType = headersRecord['content-type'] || 'text/html';
  const contentLengthBytes = Buffer.byteLength(html, 'utf8');

  try {
    const baseReport = analyzeWebsite(
      {
        targetUrl: safety.urlObj.toString(),
        finalUrl,
        httpStatus: fetchResponse.status,
        headers: headersRecord,
        fetchTimeMs: fetchDuration,
        contentType,
        contentLengthBytes,
        ipAddress: safety.ipAddress,
      },
      html
    );

    let aiInsights: AuditReport['aiAnalysis'];
    if (baseReport.auditStatus === 'incomplete') {
      aiInsights = {
        summary: `Audit Incomplete: The target server returned HTTP ${baseReport.httpStatus} (${baseReport.auditStatusReason || 'Access Denied'}). In accordance with security standards, anti-bot protections and access restrictions were not bypassed. Verified website health and performance scores could not be computed.`,
        executiveTakeaways: [
          `Server returned HTTP ${baseReport.httpStatus} (${baseReport.auditStatusReason || 'Access Denied'}).`,
          'Automated inspection was halted; verified website content and performance could not be measured.',
          'Verify server firewall, Cloudflare, or WAF access rules to allow public search crawlers if indexing is desired.'
        ],
        topActionItems: [
          {
            title: 'Verify Server Firewall & WAF Rules',
            impact: 'High',
            effort: 'Low',
            description: `The target server returned HTTP ${baseReport.httpStatus}. Ensure public web crawlers, search engines, and automated auditors are not unintentionally blocked.`
          }
        ]
      };
    } else if (requestAi !== false && aiClient) {
      aiInsights = await generateGeminiInsights(baseReport);
    } else {
      aiInsights = generateDeterministicAiInsights(baseReport);
    }

    const finalReport: AuditReport = {
      ...baseReport,
      aiAnalysis: aiInsights
    };

    return res.json({ report: finalReport });
  } catch (err: any) {
    console.error('Audit processing error:', err);
    return res.status(500).json({ error: 'Failed to process website audit: ' + err.message });
  }
});

// 3. Interactive AI Research Query Endpoint
app.post('/api/audit/ask', async (req: Request, res: Response) => {
  const { question, report } = req.body;
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Please provide a valid question.' });
  }
  if (!report || !report.url) {
    return res.status(400).json({ error: 'Audit report context is required.' });
  }

  if (!aiClient) {
    return res.json({
      answer: `AI researcher offline: For ${report.domain}, health score is ${report.overallScore ?? 'N/A'}/100. Focus on top failed checks: ${(report.findings || []).filter((f: any) => f.status === 'failed').slice(0, 3).map((f: any) => f.title).join(', ') || 'Optimize on-page SEO meta tags.'}`
    });
  }

  try {
    const prompt = `You are a Principal Website Auditor, Senior Technical SEO Strategist, and Growth Engineer at WebX-Ray.
A user is conducting deep research on their audited website:
Website URL: ${report.url}
Final Resolved URL: ${report.finalUrl || report.url}
HTTP Status: ${report.httpStatus}
Overall Health Score: ${report.overallScore ?? 'Unavailable (Incomplete)'}/100
Title: "${report.pageMeta?.title || ''}"
Meta Description: "${report.pageMeta?.description || ''}"
H1 Headings: ${JSON.stringify(report.pageMeta?.h1Text || [])}
Subheadings: ${JSON.stringify(report.telemetry?.headingsSummary || {})}
Total Word Count: ${report.telemetry?.wordCount || 0}
Server & Tech: Server=${report.telemetry?.serverHeader || 'Undisclosed'}, HSTS=${report.securityHeaders?.hasHsts}, CSP=${report.securityHeaders?.hasCsp}
Identified Issues & Opportunities:
${(report.findings || []).filter((f: any) => f.status === 'failed' || f.status === 'warning').slice(0, 10).map((f: any) => `- [${f.status.toUpperCase()}] ${f.title}: ${f.explanation}`).join('\n')}

User Research Question:
"${question.trim()}"

Provide an authoritative, specific, and actionable answer grounded strictly in the website's real technical data and content structure.
Where appropriate, provide copy examples, HTML snippets, schema definitions, or step-by-step developer instructions. Keep the tone professional, direct, and senior.`;

    const aiCall = aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AI research query timed out')), 22000)
    );

    const response = await Promise.race([aiCall, timeoutPromise]);
    const answer = response.text?.trim() || 'No research response generated.';
    return res.json({ answer });
  } catch (err: any) {
    console.error('Error in /api/audit/ask:', err);
    return res.status(500).json({ error: 'AI research error: ' + err.message });
  }
});

// Setup Vite or static serving
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WebX-Ray Server running on http://0.0.0.0:${PORT} (AI enabled: ${Boolean(aiClient)})`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

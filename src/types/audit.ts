export type FindingCategory = 'seo' | 'technical' | 'accessibility' | 'performance' | 'usability';
export type FindingStatus = 'passed' | 'warning' | 'failed' | 'not_tested' | 'inconclusive';
export type FindingPriority = 'critical' | 'high' | 'medium' | 'low';
export type FindingTestMethod = 'static_html_analysis' | 'http_header_inspection' | 'not_tested';
export type FindingConfidence = 'high' | 'medium' | 'low';

export interface Finding {
  id: string;
  category: FindingCategory;
  title: string;
  status: FindingStatus;
  priority: FindingPriority;
  testMethod: FindingTestMethod;
  confidence: FindingConfidence;
  explanation: string;
  evidence: string;
  whyItMatters: string;
  recommendation: string;
}

export type AuditStatus = 'completed' | 'partial' | 'incomplete';

export interface CategoryScore {
  score: number | null;
  passed: number;
  warning: number;
  failed: number;
  notTested: number;
  inconclusive: number;
  applicableCount: number;
}

export interface ActionItem {
  title: string;
  impact: 'High' | 'Medium' | 'Low';
  effort: 'Low' | 'Medium' | 'High';
  description: string;
  codeExample?: string;
}

export interface AIResearchData {
  businessSummary: string;
  targetAudience: string;
  valueProposition: string;
  searchIntent: {
    primaryIntent: string;
    targetQueries: string[];
    contentGaps: string[];
  };
  competitiveEdge: {
    strengths: string[];
    vulnerabilities: string[];
  };
  conversionOptimization: {
    ctaAnalysis: string;
    trustSignalsRating: 'Strong' | 'Moderate' | 'Weak';
    recommendations: string[];
  };
  growthRoadmap: {
    phase: string;
    duration: string;
    focus: string;
    actionItems: string[];
  }[];
}

export interface AIAnalysis {
  summary: string;
  executiveTakeaways: string[];
  topActionItems: ActionItem[];
  copyImprovements?: {
    titleSuggestion?: string;
    descriptionSuggestion?: string;
    ctaSuggestion?: string;
  };
  research?: AIResearchData;
}

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  h1Count: number;
  h1Text: string[];
  h2Count: number;
  h3Count: number;
  imagesCount: number;
  imagesMissingAltCount: number;
  linksCount: number;
  externalLinksCount: number;
  scriptsCount: number;
  stylesCount: number;
  hasViewport: boolean;
  viewportContent?: string;
  hasLang: boolean;
  lang: string;
  hasOpenGraph: boolean;
  hasTwitterCard: boolean;
  hasFavicon: boolean;
  hasRobotsMeta: boolean;
  robotsMeta: string;
  hasStructuredData: boolean;
  structuredDataType?: string;
}

export interface SecurityHeaders {
  hasHsts: boolean;
  hasCsp: boolean;
  hasXFrameOptions: boolean;
  hasXContentTypeOptions: boolean;
  hasReferrerPolicy: boolean;
}

export interface ServerTelemetry {
  ipAddress?: string;
  serverHeader?: string;
  compression?: string;
  cacheControl?: string;
  etag?: string;
  wordCount: number;
  readingTimeMin: number;
  headingsSummary: {
    h1: string[];
    h2: string[];
    h3: string[];
  };
  openGraphPreview?: {
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
  };
}

export interface AuditReport {
  id: string;
  url: string;
  finalUrl: string;
  domain: string;
  timestamp: string;
  fetchTimeMs: number;
  httpStatus: number;
  contentType: string;
  contentLengthBytes: number;
  isClientRendered: boolean;
  clientRenderedMarkers: string[];
  auditStatus: AuditStatus;
  auditStatusReason?: string;
  unperformedChecks?: string[];
  overallScore: number | null;
  categories: {
    seo: CategoryScore;
    technical: CategoryScore;
    accessibility: CategoryScore;
    performance: CategoryScore;
    usability: CategoryScore;
  };
  findings: Finding[];
  pageMeta: PageMeta;
  securityHeaders: SecurityHeaders;
  telemetry?: ServerTelemetry;
  aiAnalysis?: AIAnalysis;
}

export interface UserSettings {
  autoRunAi: boolean;
  autoSaveAudits: boolean;
  defaultProtocol: 'https://' | 'http://';
  theme: 'dark';
  soundEffects: boolean;
}

import React, { useState } from 'react';
import { AuditReport } from '../types/audit';
import { ScoreGauge } from './ScoreGauge';
import { 
  ArrowRight, 
  ShieldCheck, 
  FileCheck2, 
  History, 
  Globe, 
  AlertTriangle, 
  Zap, 
  ChevronRight,
  Search,
  Sparkles,
  Layers
} from 'lucide-react';

interface DashboardViewProps {
  onStartAudit: (url: string) => void;
  onViewReport: (report: AuditReport) => void;
  recentReports: AuditReport[];
  aiEnabled: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onStartAudit,
  onViewReport,
  recentReports,
  aiEnabled,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setErrorMsg('Please enter a website URL to begin audit.');
      return;
    }
    setErrorMsg('');
    onStartAudit(trimmed);
  };

  const hasHistory = recentReports.length > 0;
  const scoredReports = recentReports.filter(r => r.overallScore !== null);
  const avgScore = scoredReports.length > 0
    ? Math.round(scoredReports.reduce((acc, r) => acc + (r.overallScore || 0), 0) / scoredReports.length)
    : 0;

  const totalAudits = recentReports.length;
  const totalFailedFindings = hasHistory
    ? recentReports.reduce((acc, r) => acc + r.findings.filter(f => f.status === 'failed').length, 0)
    : 0;

  const quickSamples = [
    { name: 'Example Domain', url: 'https://example.com' },
    { name: 'Wikipedia', url: 'https://www.wikipedia.org' },
    { name: 'Hacker News', url: 'https://news.ycombinator.com' },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Primary Audit Launcher Card */}
      <div className="rounded-lg bg-white border border-[#E5E7EB] p-6 sm:p-8 space-y-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-[#F1F3F5] text-slate-700">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-600" />
            Website Intelligence Engine
          </div>

          <h2 className="text-xl sm:text-2xl font-semibold text-[#202124] tracking-tight">
            Audit and Improve Your Website
          </h2>

          <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
            Run evidence-backed inspections covering on-page SEO, technical security headers, accessibility standards, and load speed indicators.
          </p>
        </div>

        {/* URL Input Form */}
        <form onSubmit={handleQuickSubmit} className="pt-1 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 max-w-2xl">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Globe className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="Enter website URL (e.g. yoursite.com or https://example.com)"
                className="w-full pl-9 pr-3 py-2.5 rounded-md bg-white border border-[#E5E7EB] text-[#202124] placeholder-slate-400 text-xs sm:text-sm focus:outline-none focus:border-slate-500 font-mono transition-colors"
              />
            </div>

            <button
              type="submit"
              className="px-5 py-2.5 rounded-md bg-slate-800 hover:bg-slate-900 text-white font-medium text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 shrink-0"
            >
              <span>Run Website Audit</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {errorMsg && (
            <p className="text-xs text-rose-600 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              {errorMsg}
            </p>
          )}

          {/* Quick-test Presets */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B7280] pt-1">
            <span className="font-normal text-[#6B7280]">Quick Test:</span>
            {quickSamples.map((sample) => (
              <button
                key={sample.url}
                type="button"
                onClick={() => onStartAudit(sample.url)}
                className="px-2.5 py-1 rounded bg-[#F7F8FA] hover:bg-[#F1F3F5] text-slate-700 border border-[#E5E7EB] transition-colors flex items-center gap-1 font-mono text-[11px]"
              >
                <span>{sample.name}</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* Aggregate Stats Section (Only when actual audits exist) */}
      {hasHistory && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 sm:p-5 rounded-lg bg-white border border-[#E5E7EB] flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider">Average Health Score</p>
              <p className="text-2xl font-semibold font-mono text-[#202124]">{avgScore}<span className="text-xs text-[#6B7280] font-sans font-normal"> /100</span></p>
              <p className="text-xs text-[#6B7280]">Across {totalAudits} audited site(s)</p>
            </div>
            <ScoreGauge score={avgScore} size="sm" showLabel={false} />
          </div>

          <div className="p-4 sm:p-5 rounded-lg bg-white border border-[#E5E7EB] flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider">Total Scans Run</p>
              <p className="text-2xl font-semibold font-mono text-[#202124]">{totalAudits}</p>
              <p className="text-xs text-[#6B7280]">Saved in browser history</p>
            </div>
            <div className="w-9 h-9 rounded-md bg-[#F1F3F5] flex items-center justify-center text-slate-600">
              <FileCheck2 className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-lg bg-white border border-[#E5E7EB] flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider">Failed Findings</p>
              <p className="text-2xl font-semibold font-mono text-rose-600">{totalFailedFindings}</p>
              <p className="text-xs text-[#6B7280]">Checks requiring attention</p>
            </div>
            <div className="w-9 h-9 rounded-md bg-rose-50 flex items-center justify-center text-rose-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
        </div>
      )}

      {/* Platform Inspection Scope Cards */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
          Inspection Scope
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-lg bg-white border border-[#E5E7EB] space-y-1.5">
            <div className="w-7 h-7 rounded bg-[#F1F3F5] text-slate-700 flex items-center justify-center mb-1">
              <Search className="w-3.5 h-3.5" />
            </div>
            <h4 className="text-xs font-semibold text-[#202124]">On-Page SEO</h4>
            <p className="text-xs text-[#6B7280] leading-relaxed">
              Checks title length, meta description, H1-H3 heading hierarchy, canonical URL, and Schema.org markup.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-white border border-[#E5E7EB] space-y-1.5">
            <div className="w-7 h-7 rounded bg-[#F1F3F5] text-slate-700 flex items-center justify-center mb-1">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
            <h4 className="text-xs font-semibold text-[#202124]">Security Headers</h4>
            <p className="text-xs text-[#6B7280] leading-relaxed">
              Verifies HTTPS enforcement, HSTS, X-Frame-Options, MIME-type sniffing protection, and charset tags.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-white border border-[#E5E7EB] space-y-1.5">
            <div className="w-7 h-7 rounded bg-[#F1F3F5] text-slate-700 flex items-center justify-center mb-1">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <h4 className="text-xs font-semibold text-[#202124]">Speed & Payload</h4>
            <p className="text-xs text-[#6B7280] leading-relaxed">
              Measures initial server latency (TTFB), raw HTML payload size, and render-blocking scripts.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-white border border-[#E5E7EB] space-y-1.5">
            <div className="w-7 h-7 rounded bg-[#F1F3F5] text-slate-700 flex items-center justify-center mb-1">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <h4 className="text-xs font-semibold text-[#202124]">Accessibility & CTA</h4>
            <p className="text-xs text-[#6B7280] leading-relaxed">
              Audits image alt text, button naming, viewport zoom rules, navigation landmarks, and primary conversion prompts.
            </p>
          </div>
        </div>
      </div>

      {/* Recent Audits Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6B7280] flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-slate-500" />
            Recent Reports
          </h3>
          {hasHistory && (
            <span className="text-xs text-[#6B7280]">
              Showing {Math.min(5, recentReports.length)} recent audit(s)
            </span>
          )}
        </div>

        {hasHistory ? (
          <div className="rounded-lg border border-[#E5E7EB] bg-white divide-y divide-[#E5E7EB] overflow-hidden">
            {recentReports.slice(0, 5).map((report) => (
              <div
                key={report.id}
                onClick={() => onViewReport(report)}
                className="p-3.5 sm:p-4 hover:bg-[#F7F8FA] transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-md flex items-center justify-center font-mono font-semibold text-xs shrink-0 ${
                    report.overallScore === null ? 'bg-slate-100 text-slate-600 border border-slate-300' :
                    report.overallScore >= 80 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                    report.overallScore >= 50 ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                    'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}>
                    {report.overallScore === null ? '--' : report.overallScore}
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-[#202124] group-hover:text-slate-900 truncate flex items-center gap-2">
                      {report.domain}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                        report.auditStatus === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        report.auditStatus === 'partial' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                        'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {report.auditStatus === 'completed' ? 'Completed' : report.auditStatus === 'partial' ? 'Partial' : 'Incomplete'}
                      </span>
                      <span className="text-[11px] font-normal text-[#6B7280] font-mono">({report.fetchTimeMs}ms)</span>
                    </p>
                    <p className="text-[11px] text-[#6B7280] truncate">
                      {new Date(report.timestamp).toLocaleDateString()} • {report.findings.filter(f => f.status === 'passed').length} passed, {report.findings.filter(f => f.status === 'failed').length} failed
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  <div className="hidden md:flex items-center gap-1.5 text-xs text-[#6B7280]">
                    <span className="px-2 py-0.5 rounded bg-[#F1F3F5] text-[11px]">
                      SEO: {report.categories.seo.score === null ? 'N/A' : `${report.categories.seo.score}%`}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#F1F3F5] text-[11px]">
                      Tech: {report.categories.technical.score === null ? 'N/A' : `${report.categories.technical.score}%`}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#F1F3F5] text-[11px]">
                      A11y: {report.categories.accessibility.score === null ? 'N/A' : `${report.categories.accessibility.score}%`}
                    </span>
                  </div>

                  <button className="px-2.5 py-1 rounded bg-[#F1F3F5] hover:bg-slate-200 text-[#202124] text-xs font-medium transition-colors flex items-center gap-1">
                    <span>View Report</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Honest Empty State */
          <div className="p-8 sm:p-10 rounded-lg bg-white border border-[#E5E7EB] text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-[#F1F3F5] flex items-center justify-center mx-auto text-[#6B7280]">
              <Globe className="w-5 h-5 text-slate-500" />
            </div>

            <div className="space-y-1 max-w-sm mx-auto">
              <h4 className="text-sm font-semibold text-[#202124]">No Audits Run Yet</h4>
              <p className="text-xs text-[#6B7280] leading-relaxed">
                Enter a website URL above or select a sample site to inspect its technical health and receive prioritized recommendations.
              </p>
            </div>

            <button
              onClick={() => onStartAudit('https://example.com')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium transition-colors"
            >
              <span>Test with example.com</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

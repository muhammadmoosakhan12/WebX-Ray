import React, { useState } from 'react';
import { Finding } from '../types/audit';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  Check, 
  FileCode, 
  ShieldAlert, 
  Lightbulb,
  Cpu,
  Info
} from 'lucide-react';

interface FindingCardProps {
  finding: Finding;
  defaultExpanded?: boolean;
}

export const FindingCard: React.FC<FindingCardProps> = ({
  finding,
  defaultExpanded = false
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const getStatusBadge = () => {
    switch (finding.status) {
      case 'passed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Passed
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5" />
            Warning
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5" />
            Failed
          </span>
        );
      case 'inconclusive':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300">
            <Info className="w-3.5 h-3.5 text-slate-500" />
            Inconclusive
          </span>
        );
      case 'not_tested':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200">
            <HelpCircle className="w-3.5 h-3.5" />
            Not Tested
          </span>
        );
    }
  };

  const getPriorityBadge = () => {
    switch (finding.priority) {
      case 'critical':
        return <span className="px-1.5 py-0.5 text-[11px] font-medium rounded bg-rose-50 text-rose-700 border border-rose-200">Critical</span>;
      case 'high':
        return <span className="px-1.5 py-0.5 text-[11px] font-medium rounded bg-orange-50 text-orange-800 border border-orange-200">High</span>;
      case 'medium':
        return <span className="px-1.5 py-0.5 text-[11px] font-medium rounded bg-amber-50 text-amber-800 border border-amber-200">Medium</span>;
      case 'low':
      default:
        return <span className="px-1.5 py-0.5 text-[11px] font-medium rounded bg-slate-100 text-slate-600 border border-slate-200">Standard</span>;
    }
  };

  const formatTestMethod = (method: Finding['testMethod']) => {
    switch (method) {
      case 'static_html_analysis':
        return 'Initial Server HTML Inspection';
      case 'http_header_inspection':
        return 'HTTP Response Header Inspection';
      case 'not_tested':
      default:
        return 'Requires Browser Rendering (Not Tested)';
    }
  };

  const handleCopyRecommendation = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(finding.recommendation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-white transition-colors duration-150 overflow-hidden hover:border-slate-300 print:border-[#D1D5DB] print:break-inside-avoid">
      {/* Header row (clickable to expand) */}
      <div 
        onClick={() => setExpanded(!expanded)}
        className="p-4 sm:p-5 flex items-start justify-between gap-4 cursor-pointer select-none"
      >
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {getStatusBadge()}
            {finding.status !== 'passed' && getPriorityBadge()}
            <span className="text-[11px] uppercase tracking-wider text-[#6B7280] font-mono">
              {finding.category}
            </span>
            {finding.confidence && (
              <span className="text-[10px] text-slate-500 font-normal">
                • {finding.confidence === 'high' ? 'High confidence' : 'Medium confidence'}
              </span>
            )}
          </div>

          <h4 className="text-sm sm:text-base font-semibold text-[#202124]">
            {finding.title}
          </h4>

          <p className="text-xs sm:text-sm text-[#6B7280] line-clamp-2">
            {finding.explanation}
          </p>
        </div>

        <button 
          type="button"
          aria-label={expanded ? 'Collapse finding details' : 'Expand finding details'}
          className="p-1 rounded text-[#6B7280] hover:text-[#202124] hover:bg-[#F1F3F5] transition-colors mt-0.5 print:hidden"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded Details Panel */}
      {(expanded || true) && (
        <div className={`px-4 sm:px-5 pb-5 pt-3 border-t border-[#E5E7EB] space-y-4 text-xs sm:text-sm bg-[#FAFAFA] ${expanded ? 'block' : 'hidden print:block'}`}>
          {/* Diagnostic Test Method & Confidence */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#6B7280] pb-1 border-b border-[#E5E7EB]">
            <span><strong>Method:</strong> {formatTestMethod(finding.testMethod)}</span>
            <span>•</span>
            <span><strong>Confidence:</strong> {finding.confidence === 'high' ? 'High (Direct measurement)' : 'Medium (Subject to client-side DOM hydration)'}</span>
          </div>

          {/* Verified Evidence */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] mb-1.5">
              <FileCode className="w-3.5 h-3.5 text-slate-500" />
              Verified Evidence
            </div>
            <div className="p-3 rounded border border-[#E5E7EB] bg-white font-mono text-xs text-[#202124] break-all leading-relaxed">
              {finding.evidence}
            </div>
          </div>

          {/* Why it Matters */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] mb-1">
              <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />
              Why This Matters
            </div>
            <p className="text-[#374151] leading-relaxed text-xs sm:text-sm">
              {finding.whyItMatters}
            </p>
          </div>

          {/* Recommended Fix */}
          <div className="p-3.5 rounded border border-[#E5E7EB] bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-700">
                <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
                Recommended Fix
              </span>
              <button
                onClick={handleCopyRecommendation}
                className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900 font-medium px-2 py-0.5 rounded border border-[#E5E7EB] bg-[#F7F8FA] hover:bg-[#F1F3F5] transition-colors print:hidden"
                title="Copy recommended fix"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-slate-500" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <div className="text-xs sm:text-sm text-[#202124] leading-relaxed font-mono whitespace-pre-wrap break-words bg-[#F7F8FA] p-2.5 rounded border border-[#E5E7EB]">
              {finding.recommendation}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

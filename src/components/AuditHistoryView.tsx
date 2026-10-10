import React, { useState } from 'react';
import { AuditReport } from '../types/audit';
import { 
  History, 
  Trash2, 
  RotateCw, 
  ChevronRight, 
  Search, 
  Calendar, 
  FileText,
  AlertCircle
} from 'lucide-react';

interface AuditHistoryViewProps {
  reports: AuditReport[];
  onOpenReport: (report: AuditReport) => void;
  onDeleteReport: (id: string) => void;
  onReAudit: (url: string) => void;
  onClearAll: () => void;
}

export const AuditHistoryView: React.FC<AuditHistoryViewProps> = ({
  reports,
  onOpenReport,
  onDeleteReport,
  onReAudit,
  onClearAll,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredReports = reports.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return r.domain.toLowerCase().includes(q) || r.url.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-[#202124] tracking-tight">
            Audit History
          </h2>
          <p className="text-xs sm:text-sm text-[#6B7280]">
            Review and manage previously completed website audit reports.
          </p>
        </div>

        {reports.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm('Delete all saved reports from history?')) {
                onClearAll();
              }
            }}
            className="px-2.5 py-1.5 rounded-md bg-white hover:bg-rose-50 text-rose-700 border border-[#E5E7EB] hover:border-rose-200 text-xs font-medium transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear History
          </button>
        )}
      </div>

      {/* Search Input */}
      {reports.length > 0 && (
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search saved audits by domain or URL..."
            className="w-full pl-9 pr-3 py-2 rounded-md bg-white border border-[#E5E7EB] text-xs sm:text-sm text-[#202124] placeholder-slate-400 focus:outline-none focus:border-slate-500 transition-colors"
          />
        </div>
      )}

      {/* History List or Empty State */}
      {reports.length === 0 ? (
        <div className="p-10 rounded-lg bg-white border border-[#E5E7EB] text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-[#F1F3F5] flex items-center justify-center mx-auto text-[#6B7280]">
            <FileText className="w-5 h-5 text-slate-500" />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h3 className="text-sm font-semibold text-[#202124]">No Audits in History</h3>
            <p className="text-xs text-[#6B7280] leading-relaxed">
              When you run website audits, reports are automatically stored locally so you can compare progress over time.
            </p>
          </div>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="p-8 rounded-lg bg-white border border-[#E5E7EB] text-center space-y-1.5">
          <AlertCircle className="w-6 h-6 text-slate-400 mx-auto" />
          <p className="text-sm text-[#202124] font-medium">No saved reports matching "{searchQuery}"</p>
          <button
            onClick={() => setSearchQuery('')}
            className="text-xs text-slate-700 hover:underline"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-[#E5E7EB] bg-white divide-y divide-[#E5E7EB] overflow-hidden">
          {filteredReports.map((report) => (
            <div
              key={report.id}
              className="p-3.5 sm:p-4 hover:bg-[#F7F8FA] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
            >
              <div 
                onClick={() => onOpenReport(report)}
                className="flex items-center gap-3.5 cursor-pointer min-w-0 flex-1"
              >
                <div className={`w-10 h-10 rounded-md flex items-center justify-center font-mono font-semibold text-sm shrink-0 ${
                  report.overallScore === null ? 'bg-slate-100 text-slate-600 border border-slate-300' :
                  report.overallScore >= 80 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                  report.overallScore >= 50 ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                  'bg-rose-50 text-rose-700 border border-rose-200'
                }`}>
                  {report.overallScore === null ? '--' : report.overallScore}
                </div>

                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[#202124] group-hover:text-slate-900 truncate">
                      {report.domain}
                    </p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                      report.auditStatus === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      report.auditStatus === 'partial' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                      'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {report.auditStatus === 'completed' ? 'Completed' : report.auditStatus === 'partial' ? 'Partial' : 'Incomplete'}
                    </span>
                    <span className="text-[11px] font-mono text-[#6B7280]">
                      ({report.fetchTimeMs}ms)
                    </span>
                  </div>

                  <p className="text-xs text-[#6B7280] flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {new Date(report.timestamp).toLocaleDateString()} at {new Date(report.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    <span>•</span>
                    <span>{report.findings.filter(f => f.status === 'passed').length} pass, {report.findings.filter(f => f.status === 'failed').length} fail</span>
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  onClick={() => onReAudit(report.url)}
                  className="p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-[#E5E7EB] transition-colors"
                  title="Re-run audit now"
                  aria-label="Re-run audit"
                >
                  <RotateCw className="w-4 h-4" />
                </button>

                <button
                  onClick={() => onDeleteReport(report.id)}
                  className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  title="Delete report from history"
                  aria-label="Delete report"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <button
                  onClick={() => onOpenReport(report)}
                  className="px-2.5 py-1.5 rounded bg-[#F1F3F5] hover:bg-slate-200 text-[#202124] text-xs font-medium transition-colors flex items-center gap-1"
                >
                  <span>Open Report</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

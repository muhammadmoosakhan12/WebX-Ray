import React, { useState, useEffect } from 'react';
import { AuditReport } from '../types/audit';
import { 
  ArrowRight, 
  CheckCircle2, 
  Loader2, 
  Sparkles, 
  Globe, 
  AlertCircle, 
  Clock, 
  Lock, 
  FileText,
  Info
} from 'lucide-react';

interface NewAuditViewProps {
  initialUrl?: string;
  onAuditComplete: (report: AuditReport) => void;
  aiEnabled: boolean;
}

export const NewAuditView: React.FC<NewAuditViewProps> = ({
  initialUrl = '',
  onAuditComplete,
  aiEnabled,
}) => {
  const [url, setUrl] = useState(initialUrl);
  const [requestAi, setRequestAi] = useState(true);
  const [loading, setLoading] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const auditSteps = [
    { label: 'DNS & SSRF Security Check', desc: 'Validating host, rejecting loopback and private subnets' },
    { label: 'Connecting & Handshake', desc: 'Initiating HTTP/TLS connection and measuring TTFB latency' },
    { label: 'Downloading HTML & Headers', desc: 'Extracting response payload, security headers, and caching' },
    { label: 'Parsing DOM & Structure', desc: 'Auditing title, meta description, heading outline, and images' },
    { label: 'Accessibility & Usability Check', desc: 'Auditing image alt attributes, viewport tags, and button text' },
    { label: 'Synthesizing Action Plan', desc: aiEnabled && requestAi ? 'Generating Gemini 3.8 Flash recommendations' : 'Formulating deterministic action items' }
  ];

  useEffect(() => {
    if (initialUrl) {
      setUrl(initialUrl);
    }
  }, [initialUrl]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setCurrentStepIndex(0);
      interval = setInterval(() => {
        setCurrentStepIndex((prev) => {
          if (prev < auditSteps.length - 1) {
            return prev + 1;
          }
          return prev;
        });
      }, 900);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    let target = url.trim();
    if (!target) {
      setErrorMessage('Please enter a website URL to audit.');
      return;
    }

    if (!/^https?:\/\//i.test(target)) {
      target = 'https://' + target;
      setUrl(target);
    }

    try {
      const parsed = new URL(target);
      if (!parsed.hostname || parsed.hostname.length < 3) {
        setErrorMessage('Please enter a valid website domain name.');
        return;
      }
    } catch {
      setErrorMessage('The URL format is invalid. Example: https://example.com');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: target,
          requestAi: requestAi && aiEnabled,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to complete audit inspection.');
      }

      if (!data.report) {
        throw new Error('Received incomplete audit report from engine.');
      }

      onAuditComplete(data.report);
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred during website inspection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {/* View Header */}
      <div className="space-y-1">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#202124] tracking-tight">
          New Website Audit
        </h2>
        <p className="text-xs sm:text-sm text-[#6B7280]">
          Enter any public website URL to run real-time checks across SEO, performance, security headers, and accessibility.
        </p>
      </div>

      {/* Main Audit Form Card */}
      <div className="p-6 sm:p-7 rounded-lg bg-white border border-[#E5E7EB] space-y-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="website-url" className="block text-xs font-medium text-slate-700">
              Website URL
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Globe className="w-4 h-4" />
              </div>
              <input
                id="website-url"
                type="text"
                disabled={loading}
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (errorMessage) setErrorMessage('');
                }}
                placeholder="https://example.com or yoursite.com"
                className="w-full pl-9 pr-3 py-2.5 rounded-md bg-white border border-[#E5E7EB] text-[#202124] placeholder-slate-400 text-xs sm:text-sm focus:outline-none focus:border-slate-500 font-mono disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              />
            </div>
            <p className="text-[11px] text-[#6B7280] flex items-center gap-1 pt-0.5">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              Only public websites are allowed. Localhost, loopback, and private IPs are blocked for safety.
            </p>
          </div>

          {/* Configuration */}
          <div className="p-3.5 rounded-md bg-[#F7F8FA] border border-[#E5E7EB] space-y-2.5">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={requestAi}
                onChange={(e) => setRequestAi(e.target.checked)}
                disabled={loading}
                className="mt-0.5 rounded border-slate-300 text-slate-800 focus:ring-slate-500"
              />
              <div className="text-xs">
                <span className="font-medium text-[#202124] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-slate-600" />
                  Generate AI Remediation & Copy Suggestions
                </span>
                <p className="text-[#6B7280] mt-0.5">
                  {aiEnabled 
                    ? 'Powered by Gemini 3.8 Flash. Synthesizes executive takeaways, code snippets, and rewrite recommendations.'
                    : 'Gemini API key not configured. Deterministic rule-based advice will be formulated.'}
                </p>
              </div>
            </label>

            <div className="pt-2 border-t border-[#E5E7EB] flex flex-wrap gap-4 text-[11px] text-[#6B7280]">
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3 text-slate-500" />
                SSRF-Protected
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-500" />
                10s Max Timeout
              </span>
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3 text-slate-500" />
                3MB Max Body
              </span>
            </div>
          </div>

          {/* Error Message Box */}
          {errorMessage && (
            <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold text-rose-800">Inspection Failed</p>
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Submit Action Button */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2.5 rounded-md font-medium text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 ${
              loading
                ? 'bg-slate-300 text-slate-600 cursor-not-allowed'
                : 'bg-slate-800 hover:bg-slate-900 text-white'
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
                <span>Auditing Website in Real-Time...</span>
              </>
            ) : (
              <>
                <span>Begin Website Audit</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Live Multi-Stage Progress State */}
        {loading && (
          <div className="pt-4 border-t border-[#E5E7EB] space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">
                Inspection Progress
              </span>
              <span className="text-[#6B7280] font-mono">
                Step {currentStepIndex + 1} of {auditSteps.length}
              </span>
            </div>

            <div className="space-y-1.5">
              {auditSteps.map((step, idx) => {
                const isCompleted = idx < currentStepIndex;
                const isCurrent = idx === currentStepIndex;

                return (
                  <div
                    key={step.label}
                    className={`p-2.5 rounded border transition-colors flex items-center justify-between gap-2.5 text-xs ${
                      isCurrent
                        ? 'bg-[#F1F3F5] border-slate-300 text-slate-900 font-medium'
                        : isCompleted
                        ? 'bg-white border-[#E5E7EB] text-[#202124]'
                        : 'bg-[#F7F8FA] border-[#E5E7EB] text-[#6B7280]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isCompleted ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : isCurrent ? (
                        <Loader2 className="w-3.5 h-3.5 text-slate-700 animate-spin shrink-0" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0" />
                      )}

                      <div className="min-w-0">
                        <p className="truncate text-xs">
                          {step.label}
                        </p>
                        <p className="text-[11px] text-[#6B7280] truncate font-normal">
                          {step.desc}
                        </p>
                      </div>
                    </div>

                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded shrink-0 text-[#6B7280]">
                      {isCompleted ? 'Done' : isCurrent ? 'Active' : 'Queued'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

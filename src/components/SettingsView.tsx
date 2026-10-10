import React, { useState, useEffect } from 'react';
import { UserSettings } from '../types/audit';
import { 
  Settings, 
  Sparkles, 
  Database, 
  Check, 
  Download, 
  Trash2, 
  RotateCw, 
  Server, 
  Cpu, 
  Info,
  CheckCircle2,
  XCircle
} from 'lucide-react';

interface SettingsViewProps {
  settings: UserSettings;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => void;
  reportsCount: number;
  onClearAllReports: () => void;
  onExportReports: () => void;
  aiEnabled: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  reportsCount,
  onClearAllReports,
  onExportReports,
  aiEnabled,
}) => {
  const [serverStatus, setServerStatus] = useState<{
    status: string;
    version: string;
    aiEnabled: boolean;
    timestamp: string;
  } | null>(null);
  const [checkingServer, setCheckingServer] = useState(false);
  const [savedNotification, setSavedNotification] = useState(false);

  const checkStatus = async () => {
    setCheckingServer(true);
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      setServerStatus(data);
    } catch {
      setServerStatus(null);
    } finally {
      setCheckingServer(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const handleToggle = (key: keyof UserSettings) => {
    const updated = !settings[key];
    onUpdateSettings({ [key]: updated });
    setSavedNotification(true);
    setTimeout(() => setSavedNotification(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#202124] tracking-tight">
          Settings & Configuration
        </h2>
        <p className="text-xs sm:text-sm text-[#6B7280]">
          Configure inspection engine parameters and local storage preferences.
        </p>
      </div>

      {savedNotification && (
        <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium flex items-center gap-2">
          <Check className="w-4 h-4" />
          Preferences updated.
        </div>
      )}

      {/* Audit Engine Preferences */}
      <div className="p-5 sm:p-6 rounded-lg bg-white border border-[#E5E7EB] space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 font-mono flex items-center gap-2">
          <Cpu className="w-4 h-4 text-slate-500" />
          Audit & AI Engine
        </h3>

        <div className="space-y-3.5 divide-y divide-[#E5E7EB]">
          <div className="flex items-center justify-between gap-4 pt-1">
            <div className="space-y-0.5 max-w-xl">
              <label htmlFor="toggle-auto-ai" className="text-xs sm:text-sm font-medium text-[#202124] block">
                Automatic AI Synthesis
              </label>
              <p className="text-xs text-[#6B7280]">
                When enabled, WebX-Ray generates executive takeaways, copy recommendations, and code fixes using Gemini 3.8 Flash.
              </p>
            </div>
            <button
              id="toggle-auto-ai"
              type="button"
              role="switch"
              aria-checked={settings.autoRunAi}
              onClick={() => handleToggle('autoRunAi')}
              className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${
                settings.autoRunAi ? 'bg-slate-800' : 'bg-slate-200'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full bg-white transition-transform block absolute top-0.5 left-0.5 ${
                  settings.autoRunAi ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 pt-3.5">
            <div className="space-y-0.5 max-w-xl">
              <label htmlFor="toggle-auto-save" className="text-xs sm:text-sm font-medium text-[#202124] block">
                Persist Audits to Local History
              </label>
              <p className="text-xs text-[#6B7280]">
                Automatically retain completed reports in your browser's private local storage.
              </p>
            </div>
            <button
              id="toggle-auto-save"
              type="button"
              role="switch"
              aria-checked={settings.autoSaveAudits}
              onClick={() => handleToggle('autoSaveAudits')}
              className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${
                settings.autoSaveAudits ? 'bg-slate-800' : 'bg-slate-200'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full bg-white transition-transform block absolute top-0.5 left-0.5 ${
                  settings.autoSaveAudits ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Backend & AI Connection Diagnostics */}
      <div className="p-5 sm:p-6 rounded-lg bg-white border border-[#E5E7EB] space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 font-mono flex items-center gap-2">
            <Server className="w-4 h-4 text-slate-500" />
            Backend Inspection Diagnostics
          </h3>
          <button
            onClick={checkStatus}
            disabled={checkingServer}
            className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition-colors"
          >
            <RotateCw className={`w-3.5 h-3.5 ${checkingServer ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div className="p-3 rounded border border-[#E5E7EB] bg-[#F7F8FA] space-y-1">
            <span className="text-[#6B7280] font-normal">Server Inspection API</span>
            <div className="flex items-center gap-1.5 font-medium text-[#202124]">
              {serverStatus?.status === 'online' ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Online & Ready (v{serverStatus.version})</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-rose-600" />
                  <span>Unreachable</span>
                </>
              )}
            </div>
          </div>

          <div className="p-3 rounded border border-[#E5E7EB] bg-[#F7F8FA] space-y-1">
            <span className="text-[#6B7280] font-normal">Gemini 3.8 Flash Status</span>
            <div className="flex items-center gap-1.5 font-medium text-[#202124]">
              {serverStatus?.aiEnabled ? (
                <>
                  <Sparkles className="w-4 h-4 text-slate-600" />
                  <span>Live Integration Active</span>
                </>
              ) : (
                <>
                  <Info className="w-4 h-4 text-amber-600" />
                  <span>Deterministic Engine</span>
                </>
              )}
            </div>
          </div>
        </div>

        <p className="text-xs text-[#6B7280] leading-relaxed">
          WebX-Ray uses a dedicated server-side inspection route with private-IP SSRF protection, DNS verification, and a 10s request timeout.
        </p>
      </div>

      {/* Local Storage & Data Management */}
      <div className="p-5 sm:p-6 rounded-lg bg-white border border-[#E5E7EB] space-y-3.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 font-mono flex items-center gap-2">
          <Database className="w-4 h-4 text-slate-500" />
          Local Data Management
        </h3>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded border border-[#E5E7EB] bg-[#F7F8FA]">
          <div>
            <p className="text-xs sm:text-sm font-medium text-[#202124]">
              {reportsCount} Saved Audit Report(s)
            </p>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Reports are kept in your browser's private local storage.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {reportsCount > 0 && (
              <button
                onClick={onExportReports}
                className="px-2.5 py-1.5 rounded bg-white hover:bg-[#F1F3F5] text-slate-700 border border-[#E5E7EB] text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Export JSON
              </button>
            )}

            {reportsCount > 0 && (
              <button
                onClick={() => {
                  if (window.confirm('Clear all saved audits?')) {
                    onClearAllReports();
                  }
                }}
                className="px-2.5 py-1.5 rounded bg-white hover:bg-rose-50 text-rose-700 border border-[#E5E7EB] hover:border-rose-200 text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

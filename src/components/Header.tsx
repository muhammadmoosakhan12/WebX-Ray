import React from 'react';
import { Menu, Shield, PlusCircle } from 'lucide-react';
import { ActiveTab } from './Sidebar';

interface HeaderProps {
  activeTab: ActiveTab;
  onOpenMobileNav: () => void;
  onQuickAuditClick: () => void;
  activeDomain?: string;
  overallScore?: number | null;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onOpenMobileNav,
  onQuickAuditClick,
  activeDomain,
  overallScore,
}) => {
  const getTabTitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return 'Dashboard';
      case 'new_audit':
        return 'New Website Audit';
      case 'results':
        return activeDomain ? `Audit Report — ${activeDomain}` : 'Audit Results';
      case 'history':
        return 'Audit History';
      case 'settings':
        return 'Settings';
    }
  };

  return (
    <header className="h-14 px-4 sm:px-6 bg-white border-b border-[#E5E7EB] sticky top-0 z-30 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileNav}
          className="lg:hidden p-1.5 rounded-md text-[#6B7280] hover:text-[#202124] hover:bg-[#F1F3F5] transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <h1 className="text-sm sm:text-base font-semibold text-[#202124] truncate flex items-center gap-2.5">
            {getTabTitle()}
            {activeTab === 'results' && (
              overallScore === null ? (
                <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-slate-100 text-slate-600 border border-slate-200">
                  Score unavailable
                </span>
              ) : overallScore !== undefined ? (
                <span className={`text-xs px-2 py-0.5 rounded font-mono font-medium ${
                  overallScore >= 80 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                  overallScore >= 50 ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                  'bg-rose-50 text-rose-700 border border-rose-200'
                }`}>
                  {overallScore}/100
                </span>
              ) : null
            )}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {activeTab !== 'new_audit' && (
          <button
            onClick={onQuickAuditClick}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium transition-colors"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            New Audit
          </button>
        )}

        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#E5E7EB] bg-[#F7F8FA] text-xs text-[#6B7280]">
          <Shield className="w-3.5 h-3.5 text-slate-500" />
          <span className="font-mono text-[11px]">Safe Inspection</span>
        </div>
      </div>
    </header>
  );
};

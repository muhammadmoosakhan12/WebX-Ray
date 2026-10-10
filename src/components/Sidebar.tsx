import React from 'react';
import { 
  LayoutDashboard, 
  SearchCode, 
  FileText, 
  History, 
  Settings, 
  ShieldCheck, 
  Sparkles, 
  X
} from 'lucide-react';

export type ActiveTab = 'dashboard' | 'new_audit' | 'results' | 'history' | 'settings';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  hasActiveReport: boolean;
  isOpenMobile: boolean;
  setIsOpenMobile: (open: boolean) => void;
  aiEnabled: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  hasActiveReport,
  isOpenMobile,
  setIsOpenMobile,
  aiEnabled,
}) => {
  const navItems = [
    {
      id: 'dashboard' as ActiveTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      id: 'new_audit' as ActiveTab,
      label: 'New Audit',
      icon: SearchCode,
    },
    {
      id: 'results' as ActiveTab,
      label: 'Audit Results',
      icon: FileText,
      badge: hasActiveReport ? 'Active' : undefined,
      disabled: !hasActiveReport
    },
    {
      id: 'history' as ActiveTab,
      label: 'Audit History',
      icon: History,
    },
    {
      id: 'settings' as ActiveTab,
      label: 'Settings',
      icon: Settings,
    }
  ];

  const handleNavClick = (tab: ActiveTab, disabled?: boolean) => {
    if (disabled) return;
    setActiveTab(tab);
    setIsOpenMobile(false);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div 
          onClick={() => setIsOpenMobile(false)}
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-40 lg:hidden"
        />
      )}

      {/* Main Sidebar */}
      <aside className={`fixed lg:static top-0 bottom-0 left-0 z-50 w-60 bg-white border-r border-[#E5E7EB] flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
        isOpenMobile ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Brand Header */}
        <div className="h-14 px-4 border-b border-[#E5E7EB] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-slate-800 flex items-center justify-center text-white shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold text-sm tracking-tight text-[#202124]">WebX-Ray</span>
              <span className="text-[10px] text-[#6B7280] font-normal ml-1.5 font-mono">v1.0</span>
            </div>
          </div>

          <button
            onClick={() => setIsOpenMobile(false)}
            className="lg:hidden p-1 rounded text-[#6B7280] hover:text-[#202124] hover:bg-[#F1F3F5]"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation list */}
        <div className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          <div className="px-2 py-1.5 text-[11px] uppercase tracking-wider font-medium text-[#6B7280]">
            Navigation
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const isDisabled = item.disabled;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id, isDisabled)}
                disabled={isDisabled}
                className={`w-full text-left px-2.5 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors flex items-center justify-between group ${
                  isActive
                    ? 'bg-[#F1F3F5] text-[#202124]'
                    : isDisabled
                    ? 'text-slate-300 cursor-not-allowed opacity-60'
                    : 'text-[#6B7280] hover:text-[#202124] hover:bg-[#F7F8FA]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon className={`w-4 h-4 transition-colors shrink-0 ${
                    isActive ? 'text-slate-800' : isDisabled ? 'text-slate-300' : 'text-slate-500 group-hover:text-slate-700'
                  }`} />
                  <span className="truncate">{item.label}</span>
                </div>

                {item.badge && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200 text-slate-700">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Engine status indicator footer */}
        <div className="p-3 m-3 rounded-lg border border-[#E5E7EB] bg-[#F7F8FA] space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[#6B7280] font-normal">Audit Engine</span>
            <span className="flex items-center gap-1.5 text-emerald-700 font-medium text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Online
            </span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-[#E5E7EB]">
            <span className="text-[#6B7280] font-normal flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-slate-500" />
              Intelligence
            </span>
            <span className="text-[11px] font-medium text-slate-700">
              {aiEnabled ? 'Gemini 3.8 Flash' : 'Deterministic'}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
};

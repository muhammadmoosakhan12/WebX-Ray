import React, { useState, useEffect } from 'react';
import { AuditReport, UserSettings } from './types/audit';
import { 
  getSavedReports, 
  saveReport, 
  deleteReport, 
  clearAllReports, 
  getUserSettings, 
  saveUserSettings 
} from './utils/storage';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { NewAuditView } from './components/NewAuditView';
import { AuditResultsView } from './components/AuditResultsView';
import { AuditHistoryView } from './components/AuditHistoryView';
import { SettingsView } from './components/SettingsView';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [reports, setReports] = useState<AuditReport[]>([]);
  const [currentReport, setCurrentReport] = useState<AuditReport | null>(null);
  const [settings, setSettings] = useState<UserSettings>(getUserSettings());
  const [aiEnabled, setAiEnabled] = useState<boolean>(false);
  const [targetUrlForAudit, setTargetUrlForAudit] = useState<string>('');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);

  // Initialize reports from local storage and check backend engine status
  useEffect(() => {
    const loadedReports = getSavedReports();
    setReports(loadedReports);
    if (loadedReports.length > 0) {
      setCurrentReport(loadedReports[0]);
    }

    // Check backend API status
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        if (data.aiEnabled) {
          setAiEnabled(true);
        }
      })
      .catch(err => {
        console.warn('Could not contact /api/status:', err);
      });
  }, []);

  // Handle audit completion
  const handleAuditComplete = (report: AuditReport) => {
    setCurrentReport(report);
    if (settings.autoSaveAudits) {
      saveReport(report);
      setReports(getSavedReports());
    }
    setActiveTab('results');
  };

  // Launch audit from Dashboard or preset
  const handleStartAuditFromUrl = (url: string) => {
    setTargetUrlForAudit(url);
    setActiveTab('new_audit');
  };

  // Re-audit from results or history
  const handleReAudit = (url: string) => {
    setTargetUrlForAudit(url);
    setActiveTab('new_audit');
  };

  // View specific report
  const handleViewReport = (report: AuditReport) => {
    setCurrentReport(report);
    setActiveTab('results');
  };

  // Delete a report
  const handleDeleteReport = (id: string) => {
    deleteReport(id);
    const updated = getSavedReports();
    setReports(updated);
    if (currentReport?.id === id) {
      setCurrentReport(updated.length > 0 ? updated[0] : null);
    }
  };

  // Clear all reports
  const handleClearAllReports = () => {
    clearAllReports();
    setReports([]);
    setCurrentReport(null);
  };

  // Export reports to JSON file download
  const handleExportReports = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(reports, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `webxray_audits_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Update settings
  const handleUpdateSettings = (newSettings: Partial<UserSettings>) => {
    const saved = saveUserSettings(newSettings);
    setSettings(saved);
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#202124] flex flex-col lg:flex-row antialiased">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasActiveReport={Boolean(currentReport)}
        isOpenMobile={isMobileNavOpen}
        setIsOpenMobile={setIsMobileNavOpen}
        aiEnabled={aiEnabled}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <Header
          activeTab={activeTab}
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
          onQuickAuditClick={() => {
            setTargetUrlForAudit('');
            setActiveTab('new_audit');
          }}
          activeDomain={currentReport?.domain}
          overallScore={currentReport?.overallScore}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              onStartAudit={handleStartAuditFromUrl}
              onViewReport={handleViewReport}
              recentReports={reports}
              aiEnabled={aiEnabled}
            />
          )}

          {activeTab === 'new_audit' && (
            <NewAuditView
              initialUrl={targetUrlForAudit}
              onAuditComplete={handleAuditComplete}
              aiEnabled={aiEnabled}
            />
          )}

          {activeTab === 'results' && currentReport && (
            <AuditResultsView
              report={currentReport}
              onReAudit={handleReAudit}
              aiEnabled={aiEnabled}
            />
          )}

          {activeTab === 'history' && (
            <AuditHistoryView
              reports={reports}
              onOpenReport={handleViewReport}
              onDeleteReport={handleDeleteReport}
              onReAudit={handleReAudit}
              onClearAll={handleClearAllReports}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              reportsCount={reports.length}
              onClearAllReports={handleClearAllReports}
              onExportReports={handleExportReports}
              aiEnabled={aiEnabled}
            />
          )}
        </main>
      </div>
    </div>
  );
}

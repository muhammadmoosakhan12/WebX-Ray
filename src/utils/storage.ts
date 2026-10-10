import { AuditReport, UserSettings } from '../types/audit';

const STORAGE_KEY_REPORTS = 'webxray_audit_reports_v1';
const STORAGE_KEY_SETTINGS = 'webxray_user_settings_v1';

export const defaultSettings: UserSettings = {
  autoRunAi: true,
  autoSaveAudits: true,
  defaultProtocol: 'https://',
  theme: 'dark',
  soundEffects: false,
};

export function getSavedReports(): AuditReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REPORTS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse saved audit reports from localStorage', err);
    return [];
  }
}

export function saveReport(report: AuditReport): void {
  try {
    const existing = getSavedReports();
    // Prepend new report or update if id matches
    const filtered = existing.filter(r => r.id !== report.id);
    const updated = [report, ...filtered].slice(0, 30); // Keep last 30 reports
    localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save audit report to localStorage', err);
  }
}

export function deleteReport(id: string): void {
  try {
    const existing = getSavedReports();
    const updated = existing.filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to delete audit report from localStorage', err);
  }
}

export function clearAllReports(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_REPORTS);
  } catch (err) {
    console.error('Failed to clear reports from localStorage', err);
  }
}

export function getUserSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (!raw) return defaultSettings;
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch (err) {
    return defaultSettings;
  }
}

export function saveUserSettings(settings: Partial<UserSettings>): UserSettings {
  try {
    const current = getUserSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(updated));
    return updated;
  } catch (err) {
    return defaultSettings;
  }
}

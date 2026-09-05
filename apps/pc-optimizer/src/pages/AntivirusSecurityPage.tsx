/**
 * AntivirusSecurityPage — Unified antivirus and security hub.
 *
 * Combines all security features into one page with tabs:
 * - Scan: Quick/Full/Custom scan buttons + scan results
 * - Real-Time: Real-time protection toggle + AV engine status
 * - Quarantine: Quarantined threats management
 * - Advanced: Safe Folder, Advanced Security, Threat Engine config
 *
 * Covers: viruses, trojans, worms, ransomware, adware, spyware, PUPs,
 * rootkits, bootkits, and all other malware categories.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../components/PageHeader';
import { HelpButton } from '../components/HelpButton';
import { rpc } from '../services/rpc';
import { RPC_METHODS } from '@avs/shared/rpc';
import { useEdition } from '../config/EditionManager';
import { ScanView } from '../features/scan';
import { Modal } from '../features/dashboard/components/Modal';
import {
  ShieldCheckIcon,
  ShieldExclamationIcon,
  ArrowPathIcon,
  BoltIcon,
  EyeIcon,
  LockClosedIcon,
  BugAntIcon,
  FireIcon,
  ClockIcon,
  ChartBarIcon,
  DocumentTextIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

type TabId = 'scan' | 'realtime' | 'quarantine' | 'statistics' | 'advanced';

interface ThreatItem {
  id: string;
  quarantine_id?: string;
  name: string;
  severity: string;
  category: string;
  path: string;
  quarantined: boolean;
  timestamp: string;
}

const TABS: Array<{ id: TabId; label: string; icon: typeof ShieldCheckIcon }> = [
  { id: 'scan', label: 'Scan & Remove', icon: BugAntIcon },
  { id: 'realtime', label: 'Real-Time Protection', icon: EyeIcon },
  { id: 'quarantine', label: 'Quarantine', icon: LockClosedIcon },
  { id: 'statistics', label: 'Statistics', icon: ChartBarIcon },
  { id: 'advanced', label: 'Advanced Security', icon: ShieldExclamationIcon },
];

const THREAT_COVERAGE = [
  { label: 'Viruses', icon: BugAntIcon },
  { label: 'Trojans', icon: ShieldExclamationIcon },
  { label: 'Worms', icon: BoltIcon },
  { label: 'Ransomware', icon: LockClosedIcon },
  { label: 'Adware', icon: FireIcon },
  { label: 'Spyware', icon: EyeIcon },
  { label: 'PUPs', icon: ChartBarIcon },
  { label: 'Rootkits', icon: ShieldCheckIcon },
];

export default function AntivirusSecurityPage() {
  const [activeTab, setActiveTab] = useState<TabId>('scan');
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanMode, setScanMode] = useState<'quick' | 'full'>('quick');
  const edition = useEdition();
  const isPro = edition === 'professional';

  // Real-time protection state
  const [rtGuardEnabled, setRtGuardEnabled] = useState(false);
  const [rtGuardLoading, setRtGuardLoading] = useState(false);

  // AV engine state
  const [avStatus, setAvStatus] = useState<{ installed: boolean; clamd_running: boolean; signature_count: number; version: string | null } | null>(null);

  // Unified AV status (detects third-party AV, hides Defender when our AV is active)
  const [unifiedAv, setUnifiedAv] = useState<{ avs_av_active: boolean; avs_signatures: number; primary_av: string | null; defender_visible: boolean; third_party_av: string | null; protected: boolean } | null>(null);

  // Quarantine state
  const [threats, setThreats] = useState<ThreatItem[]>([]);
  const [threatsLoading, setThreatsLoading] = useState(false);
  const [selectedThreats, setSelectedThreats] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  // Setup status (definitions downloading, etc.)
  const [setupStatus, setSetupStatus] = useState<{ setup_in_progress: boolean; setup_progress?: { phase?: string } } | null>(null);

  // Scan scheduler state
  const [schedule, setSchedule] = useState<{ enabled: boolean; frequency: string; time: string; scan_type: string; day_of_week: number; last_run: string | null; scheduler_running: boolean } | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // USB auto-scan state
  const [usbStatus, setUsbStatus] = useState<{ running: boolean; auto_scan_enabled: boolean; devices_watched: number; scans_triggered: number } | null>(null);
  const [usbDevices, setUsbDevices] = useState<Array<{ drive_letter: string; label: string; size: number; filesystem: string }>>([]);
  const [usbLoading, setUsbLoading] = useState(false);

  // Email attachment scanner state
  const [emailScanResult, setEmailScanResult] = useState<{ scanned: number; threats_found: number; safe: boolean; threat_level: string; results: Array<{ file_info: { name: string }; threat_level: string; threats: string[] }>; message?: string } | null>(null);
  const [emailScanning, setEmailScanning] = useState(false);

  // Gaming Mode state
  const [gameModeActive, setGameModeActive] = useState(false);
  const [gameModeLoading, setGameModeLoading] = useState(false);

  // Startup scan state
  const [startupScanStatus, setStartupScanStatus] = useState<{ enabled: boolean; scan_boot_sector: boolean; scan_running: boolean; last_scan: { files_scanned: number; threats_found: number; boot_sector_scanned: boolean } | null } | null>(null);
  const [startupScanLoading, setStartupScanLoading] = useState(false);

  // Excluded extensions state
  const [excludedExtensions, setExcludedExtensions] = useState<string[]>([]);
  const [newExtension, setNewExtension] = useState('');
  const [excludeLoading, setExcludeLoading] = useState(false);

  // One-click security scan state
  const [oneClickProgress, setOneClickProgress] = useState<{ active: boolean; phase: string; scan_progress: number; optimize_progress: number; threats_found: number; threats_quarantined: number; space_freed: number; files_cleaned: number; error: string | null; current_file: string | null; files_scanned: number } | null>(null);
  const [oneClickResult, setOneClickResult] = useState<{ threats_found: number; threats_quarantined: number; files_scanned: number; success: boolean } | null>(null);
  const [oneClickModalOpen, setOneClickModalOpen] = useState(false);
  const [oneClickCancelling, setOneClickCancelling] = useState(false);
  const oneClickPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Post-scan summary state
  const [scanSummary, setScanSummary] = useState<{ report_id: string; scan_type: string; duration_seconds: number; files_scanned: number; threats_found: number; posture: { status: string; score: number; label: string; color: string; high_severity_count: number; critical_count: number }; threat_breakdown: { by_category: Record<string, number>; by_severity: Record<string, number>; quarantined: number; pending: number }; recommendations: Array<{ id: string; priority: string; title: string; description: string; action: string | null }>; top_threats: Array<{ name: string; category: string; severity: string; path: string; quarantined: boolean }> } | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [recentSummaries, setRecentSummaries] = useState<Array<{ report_id: string; scan_type: string; completed_at: string; threats_found: number; files_scanned: number; posture: { status: string; score: number; label: string } }>>([]);

  // Security score state
  const [securityScore, setSecurityScore] = useState<{ overall_score: number; status: string; categories: Record<string, number>; factors: Array<{ id: string; name: string; score: number; max: number; status: string; detail: string }>; recommendations: Array<{ id: string; priority: string; title: string; description: string }> } | null>(null);

  // Threat statistics state
  const [threatStats, setThreatStats] = useState<{ total_scans: number; total_threats_detected: number; total_files_scanned: number; avg_files_per_scan: number; clean_scans: number; infected_scans: number; current_quarantine_count: number; total_quarantined: number; by_category: Record<string, number>; by_severity: Record<string, number>; by_source: Record<string, number>; by_scan_type: Record<string, number>; top_threats: Array<{ name: string; count: number }>; top_directories: Array<{ path: string; count: number }>; threats_over_time: Array<{ date: string; threats: number }>; recent_activity: Array<{ type: string; scan_type: string; date: string; threats_found: number; files_scanned: number }>; last_scan: { date: string; scan_type: string; threats_found: number; files_scanned: number } | null } | null>(null);

  // ── Data loading ──────────────────────────────────────────────

  const refreshAvStatus = useCallback(async () => {
    try {
      const res = await rpc.raw<{ success?: boolean; status?: { installed: boolean; clamd_running: boolean; signature_count: number; version: string | null }; installed?: boolean; clamd_running?: boolean; signature_count?: number; version?: string | null }>(RPC_METHODS.THREAT_CLAMAV_STATUS);
      // Backend returns { success, status: {...} } — unwrap if needed
      const flat = res.status ? res.status : res;
      setAvStatus({
        installed: flat.installed ?? false,
        clamd_running: flat.clamd_running ?? false,
        signature_count: flat.signature_count ?? 0,
        version: flat.version ?? null,
      });
    } catch { /* ignore */ }
  }, []);

  const refreshThreats = useCallback(async () => {
    setThreatsLoading(true);
    try {
      const res = await rpc.raw<{ items?: Array<{ quarantine_id: string; original_path: string; threat_name: string; threat_info: { severity: string; threat_type: string; detection_source: string }; size: number; quarantined_at: string }> }>(RPC_METHODS.THREAT_QUARANTINE_LIST);
      const items = res.items || [];
      const mapped: ThreatItem[] = items.map((item) => ({
        id: item.quarantine_id,
        quarantine_id: item.quarantine_id,
        name: item.threat_name || 'Unknown',
        severity: item.threat_info?.severity || 'medium',
        category: item.threat_info?.threat_type || 'unknown',
        path: item.original_path || '',
        quarantined: true,
        timestamp: item.quarantined_at || new Date().toISOString(),
      }));
      setThreats(mapped);
    } catch {
      // Fallback to threat.listThreats if quarantine list fails
      try {
        const res = await rpc.raw<{ threats?: ThreatItem[] }>(RPC_METHODS.THREAT_LIST_THREATS);
        setThreats(res.threats || []);
      } catch {
        setThreats([]);
      }
    }
    setThreatsLoading(false);
  }, []);

  const refreshSetupStatus = useCallback(async () => {
    try {
      const res = await rpc.raw<{ success?: boolean; status?: { setup_in_progress: boolean; setup_progress?: { phase?: string } }; setup_in_progress?: boolean; setup_progress?: { phase?: string } }>(RPC_METHODS.THREAT_CLAMAV_SETUP_STATUS);
      // Backend returns { success, status: {...} } — unwrap if needed
      const flat = res.status ? res.status : res;
      setSetupStatus({ setup_in_progress: flat.setup_in_progress ?? false, setup_progress: flat.setup_progress });
    } catch { /* ignore */ }
  }, []);

  const refreshSchedule = useCallback(async () => {
    try {
      const res = await rpc.raw<{ schedule: { enabled: boolean; frequency: string; time: string; scan_type: string; day_of_week: number; last_run: string | null; scheduler_running: boolean } }>(RPC_METHODS.THREAT_SCAN_SCHEDULE_GET);
      setSchedule(res.schedule);
    } catch { /* ignore */ }
  }, []);

  const updateSchedule = useCallback(async (updates: Record<string, unknown>) => {
    setScheduleLoading(true);
    try {
      await rpc.raw(RPC_METHODS.THREAT_SCAN_SCHEDULE_SET, updates);
      await refreshSchedule();
    } catch { /* ignore */ }
    setScheduleLoading(false);
  }, [refreshSchedule]);

  const refreshUsbStatus = useCallback(async () => {
    try {
      const res = await rpc.raw<{ status: { running: boolean; auto_scan_enabled: boolean; devices_watched: number; scans_triggered: number }; devices: Array<{ drive_letter: string; label: string; size: number; filesystem: string }> }>(RPC_METHODS.REALTIME_THREAT_USB_AUTO_SCAN_STATUS);
      setUsbStatus(res.status);
      setUsbDevices(res.devices || []);
    } catch { /* ignore */ }
  }, []);

  const toggleUsbAutoScan = useCallback(async (enable: boolean) => {
    setUsbLoading(true);
    try {
      if (enable) {
        await rpc.raw(RPC_METHODS.REALTIME_THREAT_USB_AUTO_SCAN_START);
      } else {
        await rpc.raw(RPC_METHODS.REALTIME_THREAT_USB_AUTO_SCAN_STOP);
      }
      await refreshUsbStatus();
    } catch { /* ignore */ }
    setUsbLoading(false);
  }, [refreshUsbStatus]);

  const scanOutlookAttachments = useCallback(async () => {
    setEmailScanning(true);
    try {
      const res = await rpc.raw<{ result: { scanned: number; threats_found: number; safe: boolean; threat_level: string; results: Array<{ file_info: { name: string }; threat_level: string; threats: string[] }>; message?: string } }>(RPC_METHODS.ADV_SECURITY_EMAIL_SCAN_OUTLOOK);
      setEmailScanResult(res.result);
    } catch { /* ignore */ }
    setEmailScanning(false);
  }, []);

  const refreshGameMode = useCallback(async () => {
    try {
      const res = await rpc.raw<{ status: { active: boolean } }>(RPC_METHODS.AI_GAME_MODE_STATUS);
      setGameModeActive(res.status.active);
    } catch { /* ignore */ }
  }, []);

  const toggleGameMode = useCallback(async () => {
    setGameModeLoading(true);
    try {
      await rpc.raw(RPC_METHODS.AI_GAME_MODE_TOGGLE);
      await refreshGameMode();
    } catch { /* ignore */ }
    setGameModeLoading(false);
  }, [refreshGameMode]);

  const refreshStartupScan = useCallback(async () => {
    try {
      const res = await rpc.raw<{ status: { enabled: boolean; scan_boot_sector: boolean; scan_running: boolean; last_scan: { files_scanned: number; threats_found: number; boot_sector_scanned: boolean } | null } }>(RPC_METHODS.THREAT_STARTUP_SCAN_STATUS);
      setStartupScanStatus(res.status);
    } catch { /* ignore */ }
  }, []);

  const toggleStartupScan = useCallback(async (enable: boolean) => {
    setStartupScanLoading(true);
    try {
      await rpc.raw(RPC_METHODS.THREAT_STARTUP_SCAN_CONFIGURE, { enabled: enable });
      await refreshStartupScan();
    } catch { /* ignore */ }
    setStartupScanLoading(false);
  }, [refreshStartupScan]);

  const runStartupScanNow = useCallback(async () => {
    setStartupScanLoading(true);
    try {
      await rpc.raw(RPC_METHODS.THREAT_STARTUP_SCAN_RUN_NOW);
      await refreshStartupScan();
    } catch { /* ignore */ }
    setStartupScanLoading(false);
  }, [refreshStartupScan]);

  const refreshExclusions = useCallback(async () => {
    try {
      const res = await rpc.raw<{ config: { exclude_extensions: string[] } }>(RPC_METHODS.THREAT_STATUS);
      setExcludedExtensions(res.config?.exclude_extensions || []);
    } catch { /* ignore */ }
  }, []);

  const addExcludedExtension = useCallback(async () => {
    let ext = newExtension.trim().toLowerCase();
    if (!ext) return;
    if (!ext.startsWith('.')) ext = '.' + ext;
    if (excludedExtensions.includes(ext)) return;
    const updated = [...excludedExtensions, ext];
    setExcludeLoading(true);
    try {
      await rpc.raw(RPC_METHODS.THREAT_CONFIGURE, { exclude_extensions: updated });
      setExcludedExtensions(updated);
      setNewExtension('');
    } catch { /* ignore */ }
    setExcludeLoading(false);
  }, [newExtension, excludedExtensions]);

  const removeExcludedExtension = useCallback(async (ext: string) => {
    const updated = excludedExtensions.filter((e) => e !== ext);
    setExcludeLoading(true);
    try {
      await rpc.raw(RPC_METHODS.THREAT_CONFIGURE, { exclude_extensions: updated });
      setExcludedExtensions(updated);
    } catch { /* ignore */ }
    setExcludeLoading(false);
  }, [excludedExtensions]);

  const startOneClick = useCallback(async () => {
    setOneClickResult(null);
    setOneClickCancelling(false);
    setOneClickModalOpen(true);
    setOneClickProgress({ active: true, phase: 'scanning', scan_progress: 1, optimize_progress: 0, threats_found: 0, threats_quarantined: 0, space_freed: 0, files_cleaned: 0, error: null, current_file: 'Initializing scan...', files_scanned: 0 });
    try {
      const startRes = await rpc.raw<{ success?: boolean; error?: string; progress?: Record<string, unknown> }>(RPC_METHODS.ONE_CLICK_START, { scan_type: 'quick' });
      if (!startRes.success && startRes.error) {
        setOneClickProgress({ active: false, phase: 'error', scan_progress: 0, optimize_progress: 0, threats_found: 0, threats_quarantined: 0, space_freed: 0, files_cleaned: 0, error: startRes.error, current_file: null, files_scanned: 0 });
        return;
      }
      // Poll progress — tracked via ref for cleanup on unmount
      const poll = setInterval(async () => {
        try {
          const prog = await rpc.raw<{ active: boolean; phase: string; scan_progress: number; optimize_progress: number; threats_found: number; threats_quarantined: number; space_freed: number; files_cleaned: number; error: string | null; current_file: string | null; files_scanned: number }>(RPC_METHODS.ONE_CLICK_PROGRESS);
          setOneClickProgress(prog);
          if (!prog.active) {
            clearInterval(poll);
            oneClickPollRef.current = null;
            setOneClickCancelling(false);
            if (prog.phase === 'complete') {
              setOneClickResult({
                threats_found: prog.threats_found,
                threats_quarantined: prog.threats_quarantined || 0,
                files_scanned: prog.files_scanned || 0,
                success: true,
              });
              refreshThreats();
              refreshAvStatus();
            }
          }
        } catch (e) {
          clearInterval(poll);
          oneClickPollRef.current = null;
          setOneClickCancelling(false);
          const errMsg = e instanceof Error ? e.message : 'Failed to get progress';
          setOneClickProgress(prev => prev ? { ...prev, active: false, error: errMsg } : null);
        }
      }, 500);
      oneClickPollRef.current = poll;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Failed to start security scan';
      setOneClickProgress({ active: false, phase: 'error', scan_progress: 0, optimize_progress: 0, threats_found: 0, threats_quarantined: 0, space_freed: 0, files_cleaned: 0, error: errMsg, current_file: null, files_scanned: 0 });
    }
  }, [refreshThreats, refreshAvStatus]);

  const cancelOneClick = useCallback(async () => {
    setOneClickCancelling(true);
    try {
      await rpc.raw(RPC_METHODS.ONE_CLICK_CANCEL);
    } catch { /* ignore */ }
  }, []);

  const closeOneClickModal = useCallback(() => {
    if (oneClickProgress?.active && !oneClickCancelling) return;
    setOneClickModalOpen(false);
    setOneClickCancelling(false);
  }, [oneClickProgress?.active, oneClickCancelling]);

  // useEffect moved after all refresh function definitions (see below)

  // ── Handlers ──────────────────────────────────────────────────

  const toggleRtGuard = useCallback(async () => {
    setRtGuardLoading(true);
    try {
      if (rtGuardEnabled) {
        await rpc.raw(RPC_METHODS.REALTIME_THREAT_STOP);
        setRtGuardEnabled(false);
      } else {
        await rpc.raw(RPC_METHODS.REALTIME_THREAT_START);
        setRtGuardEnabled(true);
      }
    } catch { /* ignore */ }
    setRtGuardLoading(false);
  }, [rtGuardEnabled]);

  const handleRestoreThreat = useCallback(async (threatId: string) => {
    try {
      await rpc.raw(RPC_METHODS.THREAT_RESTORE, { quarantine_id: threatId });
      refreshThreats();
    } catch { /* ignore */ }
  }, [refreshThreats]);

  const handleDeleteThreat = useCallback(async (threatId: string) => {
    if (!confirm('Permanently delete this threat? This cannot be undone.')) return;
    try {
      await rpc.raw(RPC_METHODS.THREAT_QUARANTINE_DELETE_SELECTED, { quarantine_ids: [threatId] });
      refreshThreats();
    } catch { /* ignore */ }
  }, [refreshThreats]);

  const toggleThreatSelection = useCallback((threatId: string) => {
    setSelectedThreats((prev) => {
      const next = new Set(prev);
      if (next.has(threatId)) next.delete(threatId);
      else next.add(threatId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedThreats((prev) => {
      if (prev.size === threats.length) return new Set();
      return new Set(threats.map((t) => t.id));
    });
  }, [threats]);

  const handleRestoreAll = useCallback(async () => {
    if (!confirm(`Restore all ${threats.length} quarantined files?`)) return;
    setBatchLoading(true);
    try {
      await rpc.raw(RPC_METHODS.THREAT_QUARANTINE_RESTORE_ALL);
      setSelectedThreats(new Set());
      refreshThreats();
    } catch { /* ignore */ }
    setBatchLoading(false);
  }, [threats.length, refreshThreats]);

  const handleDeleteAll = useCallback(async () => {
    if (!confirm(`Permanently delete all ${threats.length} quarantined files? This cannot be undone.`)) return;
    setBatchLoading(true);
    try {
      await rpc.raw(RPC_METHODS.THREAT_QUARANTINE_DELETE_ALL);
      setSelectedThreats(new Set());
      refreshThreats();
    } catch { /* ignore */ }
    setBatchLoading(false);
  }, [threats.length, refreshThreats]);

  const handleDeleteSelected = useCallback(async () => {
    if (!confirm(`Permanently delete ${selectedThreats.size} selected file(s)? This cannot be undone.`)) return;
    setBatchLoading(true);
    try {
      await rpc.raw(RPC_METHODS.THREAT_QUARANTINE_DELETE_SELECTED, { quarantine_ids: Array.from(selectedThreats) });
      setSelectedThreats(new Set());
      refreshThreats();
    } catch { /* ignore */ }
    setBatchLoading(false);
  }, [selectedThreats, refreshThreats]);

  const refreshRecentSummaries = useCallback(async () => {
    try {
      const res = await rpc.raw<{ summaries: Array<{ report_id: string; scan_type: string; completed_at: string; threats_found: number; files_scanned: number; posture: { status: string; score: number; label: string } }> }>(RPC_METHODS.THREAT_SCAN_SUMMARY_RECENT, { limit: 5 });
      setRecentSummaries(res.summaries || []);
    } catch { /* ignore */ }
  }, []);

  const generateScanSummary = useCallback(async (scanId: string) => {
    try {
      const res = await rpc.raw<{ summary: { report_id: string; scan_type: string; duration_seconds: number; files_scanned: number; threats_found: number; posture: { status: string; score: number; label: string; color: string; high_severity_count: number; critical_count: number }; threat_breakdown: { by_category: Record<string, number>; by_severity: Record<string, number>; quarantined: number; pending: number }; recommendations: Array<{ id: string; priority: string; title: string; description: string; action: string | null }>; top_threats: Array<{ name: string; category: string; severity: string; path: string; quarantined: boolean }> } }>(RPC_METHODS.THREAT_SCAN_SUMMARY_GENERATE, { scan_id: scanId });
      setScanSummary(res.summary);
      setShowSummaryModal(true);
    } catch { /* ignore */ }
  }, []);

  const handleModalClose = useCallback(() => {
    setScanModalOpen(false);
    void refreshThreats();
    void refreshRecentSummaries();
    // Generate a summary from the most recent scan
    void (async () => {
      try {
        const histRes = await rpc.raw<{ history: Array<{ scan_id: string; completed_at: string }> }>(RPC_METHODS.THREAT_HISTORY);
        const hist = histRes.history || [];
        if (hist.length > 0) {
          const last = hist[hist.length - 1];
          if (last && last.scan_id && last.completed_at) {
            void generateScanSummary(last.scan_id);
          }
        }
      } catch { /* ignore */ }
    })();
  }, [refreshThreats, refreshRecentSummaries, generateScanSummary]);

  const refreshSecurityScore = useCallback(async () => {
    try {
      const res = await rpc.raw<{ overall_score: number; status: string; categories: Record<string, number>; factors: Array<{ id: string; name: string; score: number; max: number; status: string; detail: string }>; recommendations: Array<{ id: string; priority: string; title: string; description: string }> }>(RPC_METHODS.DASHBOARD_SECURITY_SCORE);
      setSecurityScore(res);
    } catch { /* ignore */ }
  }, []);

  const refreshThreatStats = useCallback(async () => {
    try {
      const res = await rpc.raw<{ statistics: { total_scans: number; total_threats_detected: number; total_files_scanned: number; avg_files_per_scan: number; clean_scans: number; infected_scans: number; current_quarantine_count: number; total_quarantined: number; by_category: Record<string, number>; by_severity: Record<string, number>; by_source: Record<string, number>; by_scan_type: Record<string, number>; top_threats: Array<{ name: string; count: number }>; top_directories: Array<{ path: string; count: number }>; threats_over_time: Array<{ date: string; threats: number }>; recent_activity: Array<{ type: string; scan_type: string; date: string; threats_found: number; files_scanned: number }>; last_scan: { date: string; scan_type: string; threats_found: number; files_scanned: number } | null } }>(RPC_METHODS.THREAT_STATISTICS);
      setThreatStats(res.statistics);
    } catch { /* ignore */ }
  }, []);

  // ── Initial data loading ──────────────────────────────────────
  useEffect(() => {
    rpc.raw<{ success: boolean; status: Record<string, { running: boolean } | null> }>(RPC_METHODS.REALTIME_THREAT_STATUS)
      .then((res) => {
        const st = res?.status ?? (res as Record<string, unknown>);
        if (st && typeof st === 'object') {
          const etw = (st as Record<string, { running?: boolean } | null>)?.etw_file_monitor;
          const usb = (st as Record<string, { running?: boolean } | null>)?.usb_monitor;
          const net = (st as Record<string, { running?: boolean } | null>)?.network_c2;
          const anyRunning = etw?.running === true || usb?.running === true || net?.running === true;
          setRtGuardEnabled(anyRunning);
        } else {
          setRtGuardEnabled(false);
        }
      })
      .catch(() => {});
    refreshAvStatus();
    refreshThreats();
    refreshSetupStatus();
    refreshSchedule();
    refreshUsbStatus();
    refreshGameMode();
    refreshStartupScan();
    refreshExclusions();
    refreshRecentSummaries();
    refreshSecurityScore();
    refreshThreatStats();
    rpc.raw<{ avs_av_active: boolean; avs_signatures: number; primary_av: string | null; defender_visible: boolean; third_party_av: string | null; protected: boolean }>(RPC_METHODS.SYSTEM_AV_STATUS)
      .then(setUnifiedAv)
      .catch(() => {});
    // Poll setup status every 5s only while setup is in progress.
    // Use a ref-like approach: check the fresh response each time.
    let poll: ReturnType<typeof setInterval> | null = null;
    poll = setInterval(async () => {
      try {
        const res = await rpc.raw<{ success?: boolean; status?: { setup_in_progress: boolean }; setup_in_progress?: boolean }>(RPC_METHODS.THREAT_CLAMAV_SETUP_STATUS);
        const flat = res.status ? res.status : res;
        const inProgress = flat.setup_in_progress ?? false;
        setSetupStatus({ setup_in_progress: inProgress, setup_progress: (flat as Record<string, unknown>).setup_progress as { phase?: string } | undefined });
        if (!inProgress) {
          refreshAvStatus();
          if (poll) { clearInterval(poll); poll = null; }
        } else {
          refreshAvStatus();
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => { if (poll) clearInterval(poll); };
  }, [refreshAvStatus, refreshThreats, refreshSetupStatus, refreshSchedule, refreshUsbStatus, refreshGameMode, refreshStartupScan, refreshExclusions, refreshRecentSummaries, refreshSecurityScore, refreshThreatStats]);

  // Clean up one-click poll on unmount
  useEffect(() => {
    return () => {
      if (oneClickPollRef.current) {
        clearInterval(oneClickPollRef.current);
        oneClickPollRef.current = null;
      }
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────

  return (
    <div data-testid="page-antivirus-security" className="space-y-4">
      <PageHeader
        title="Antivirus Security"
        description="Unified protection against viruses, trojans, worms, ransomware, adware, spyware, PUPs, and rootkits."
        actions={<HelpButton text="Antivirus Security combines all security features. Run a scan, enable real-time protection, manage quarantined threats, and configure advanced security." />}
      />

      {/* One-Click Security Scan — first thing the user sees */}
      <Card variant="glass" className="p-6 bg-gradient-to-br from-brand-primary/10 to-transparent" data-testid="av-one-click">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="shrink-0 rounded-[var(--avs-radius-lg)] bg-brand-primary/20 p-3">
              <BoltIcon className="h-8 w-8 text-brand-primary" />
            </div>
            <div>
              <div className="text-base font-bold text-text-primary">One-Click Security Scan</div>
              <div className="text-small text-text-secondary">
                Scan for viruses, malware, spyware, PUPs, and other threats. Detected threats are automatically quarantined.
              </div>
            </div>
          </div>
          <button
            onClick={startOneClick}
            disabled={oneClickProgress?.active}
            className="px-6 py-3 rounded-[var(--avs-radius-md)] bg-[var(--avs-brand-primary)] text-white text-small font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="one-click-btn"
          >
            {oneClickProgress?.active ? 'Scanning...' : 'Scan Now'}
          </button>
        </div>

        {/* Last scan result summary (shown when not scanning) */}
        {oneClickResult && !oneClickProgress?.active && (
          <div className="mt-4 p-4 rounded-[var(--avs-radius-md)] bg-semantic-success/5 border border-semantic-success/20" data-testid="one-click-result">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheckIcon className="h-5 w-5 text-semantic-success" />
              <span className="text-small font-semibold text-text-primary">Last Scan Complete</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-caption text-text-muted">Threats Found</div>
                <div className="text-small font-bold text-text-primary">{oneClickResult.threats_found}</div>
              </div>
              <div>
                <div className="text-caption text-text-muted">Threats Quarantined</div>
                <div className="text-small font-bold text-text-primary">{oneClickResult.threats_quarantined || 0}</div>
              </div>
              <div>
                <div className="text-caption text-text-muted">Files Scanned</div>
                <div className="text-small font-bold text-text-primary">{oneClickResult.files_scanned || 0}</div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* One-Click Scan Modal */}
      {oneClickModalOpen && (
        <Modal
          open={oneClickModalOpen}
          onClose={closeOneClickModal}
          title="Security Scan"
          size="lg"
          testId="one-click-scan-modal"
          hideCloseButton={oneClickProgress?.active && !oneClickCancelling}
          actions={
            <>
              {oneClickProgress?.active ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={cancelOneClick}
                  disabled={oneClickCancelling}
                  leftIcon={<XMarkIcon className="h-4 w-4" />}
                  data-testid="one-click-cancel-btn"
                >
                  {oneClickCancelling ? 'Cancelling...' : 'Cancel Scan'}
                </Button>
              ) : (
                <>
                  {oneClickResult && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => { setOneClickModalOpen(false); setActiveTab('quarantine'); }}
                      data-testid="one-click-review-threats"
                    >
                      {oneClickResult.threats_found > 0 ? 'Review Threats' : 'Done'}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={closeOneClickModal}>Close</Button>
                </>
              )}
            </>
          }
        >
          <div className="space-y-4">
            {/* Phase indicator */}
            <div className="flex items-center gap-3">
              {oneClickProgress?.phase === 'scanning' && <ArrowPathIcon className="h-5 w-5 animate-spin text-brand-primary" />}
              {oneClickProgress?.phase === 'cleaning' && <ShieldExclamationIcon className="h-5 w-5 text-semantic-warning" />}
              {oneClickProgress?.phase === 'complete' && <ShieldCheckIcon className="h-5 w-5 text-semantic-success" />}
              {oneClickProgress?.phase === 'cancelled' && <XMarkIcon className="h-5 w-5 text-semantic-danger" />}
              {oneClickProgress?.phase === 'error' && <ShieldExclamationIcon className="h-5 w-5 text-semantic-danger" />}
              <span className="text-small font-semibold text-text-primary">
                {oneClickProgress?.phase === 'scanning' && 'Scanning for threats...'}
                {oneClickProgress?.phase === 'cleaning' && 'Quarantining detected threats...'}
                {oneClickProgress?.phase === 'complete' && 'Scan complete.'}
                {oneClickProgress?.phase === 'cancelled' && 'Scan cancelled.'}
                {oneClickProgress?.phase === 'error' && 'Scan failed.'}
              </span>
            </div>

            {/* Progress bar */}
            {oneClickProgress && (
              <div className="space-y-2" data-testid="one-click-progress">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-caption text-text-secondary">
                    {oneClickProgress.phase === 'scanning'
                      ? `${oneClickProgress.scan_progress}% (${oneClickProgress.files_scanned || 0} files scanned)`
                      : oneClickProgress.phase === 'cleaning'
                        ? `${oneClickProgress.threats_quarantined || 0} threats quarantined`
                        : oneClickProgress.phase === 'complete'
                          ? '100% Complete'
                          : oneClickProgress.phase === 'cancelled'
                            ? 'Cancelled'
                            : 'Error'}
                  </span>
                  {oneClickProgress.threats_found > 0 && (
                    <span className="text-caption text-semantic-danger font-medium">
                      {oneClickProgress.threats_found} threat{oneClickProgress.threats_found !== 1 ? 's' : ''} found
                    </span>
                  )}
                </div>
                <div className="h-2 rounded-full bg-[var(--avs-border)] overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      oneClickProgress.phase === 'cancelled' ? 'bg-semantic-danger' :
                      oneClickProgress.phase === 'error' ? 'bg-semantic-danger' :
                      oneClickProgress.phase === 'complete' ? 'bg-semantic-success' :
                      'bg-brand-primary'
                    }`}
                    style={{ width: `${oneClickProgress.phase === 'scanning' ? oneClickProgress.scan_progress : oneClickProgress.phase === 'cleaning' ? 95 : oneClickProgress.phase === 'complete' ? 100 : oneClickProgress.phase === 'cancelled' ? oneClickProgress.scan_progress : 0}%` }}
                  />
                </div>
                {/* Current file being scanned */}
                {oneClickProgress.phase === 'scanning' && oneClickProgress.current_file && (
                  <div className="text-caption text-text-muted truncate" data-testid="one-click-current-file" title={oneClickProgress.current_file}>
                    {oneClickProgress.current_file}
                  </div>
                )}
              </div>
            )}

            {/* Result summary inside modal */}
            {oneClickResult && !oneClickProgress?.active && (
              <div className="p-4 rounded-[var(--avs-radius-md)] bg-semantic-success/5 border border-semantic-success/20" data-testid="one-click-modal-result">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheckIcon className="h-5 w-5 text-semantic-success" />
                  <span className="text-small font-semibold text-text-primary">Scan Complete</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-caption text-text-muted">Threats Found</div>
                    <div className="text-small font-bold text-text-primary">{oneClickResult.threats_found}</div>
                  </div>
                  <div>
                    <div className="text-caption text-text-muted">Threats Quarantined</div>
                    <div className="text-small font-bold text-text-primary">{oneClickResult.threats_quarantined || 0}</div>
                  </div>
                  <div>
                    <div className="text-caption text-text-muted">Files Scanned</div>
                    <div className="text-small font-bold text-text-primary">{oneClickResult.files_scanned || 0}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Error display */}
            {oneClickProgress?.error && (
              <div className="p-3 rounded bg-semantic-danger/5 border border-semantic-danger/20">
                <span className="text-small text-semantic-danger">Scan encountered an issue. Please try again.</span>
              </div>
            )}

            {/* Cancelled message */}
            {oneClickProgress?.phase === 'cancelled' && (
              <div className="p-3 rounded bg-semantic-danger/5 border border-semantic-danger/20">
                <span className="text-small text-semantic-danger">Scan was cancelled. Partial results may be available.</span>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Threat coverage badges */}
      <div className="flex flex-wrap gap-2" data-testid="threat-coverage">
        {THREAT_COVERAGE.map(({ label, icon: Icon }) => (
          <div key={label} className="flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1">
            <Icon className="h-3.5 w-3.5 text-brand-primary" />
            <span className="text-caption text-text-secondary">{label}</span>
          </div>
        ))}
      </div>

      {/* Protection status banner */}
      {unifiedAv && (
        <Card variant="glass" className={`p-4 ${unifiedAv.protected ? 'border-semantic-success/30' : 'border-semantic-warning/30'}`} data-testid="protection-banner">
          <div className="flex items-center gap-3">
            <ShieldCheckIcon className={`h-8 w-8 ${unifiedAv.protected ? 'text-semantic-success' : 'text-semantic-warning'}`} />
            <div className="flex-1">
              <div className="text-small font-semibold text-text-primary">
                {unifiedAv.protected ? 'Your PC is protected' : 'Your PC may be at risk'}
              </div>
              <div className="text-caption text-text-secondary">
                {unifiedAv.avs_av_active
                  ? 'AVS AI Shield Antivirus is active.'
                  : unifiedAv.third_party_av
                    ? `Protected by ${unifiedAv.third_party_av}. AVS AI Shield AV Engine is preparing in background.`
                    : unifiedAv.primary_av
                      ? `Protected by ${unifiedAv.primary_av}.`
                      : 'No antivirus detected. AVS AI Shield AV Engine is preparing in background.'}
              </div>
            </div>
            {unifiedAv.avs_av_active && (
              <Badge tone="success">AVS AI Antivirus</Badge>
            )}
          </div>
        </Card>
      )}

      {/* Security Score Widget */}
      {securityScore && (
        <Card variant="glass" className="p-5" data-testid="security-score-widget">
          <div className="flex items-center gap-6">
            {/* Score circle */}
            <div className="shrink-0 relative h-24 w-24" data-testid="security-score-circle">
              <svg className="h-24 w-24 -rotate-90" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="42" fill="none" stroke="var(--avs-border)" strokeWidth="6" />
                <circle
                  cx="48" cy="48" r="42" fill="none" strokeWidth="6" strokeLinecap="round"
                  stroke={
                    securityScore.status === 'excellent' ? 'var(--avs-semantic-success)' :
                    securityScore.status === 'good' ? 'var(--avs-semantic-success)' :
                    securityScore.status === 'fair' ? 'var(--avs-semantic-warning)' :
                    securityScore.status === 'poor' ? 'var(--avs-semantic-danger)' :
                    'var(--avs-semantic-danger)'
                  }
                  strokeDasharray={`${(securityScore.overall_score / 100) * 264} 264`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-text-primary">{securityScore.overall_score}</span>
                <span className="text-caption text-text-muted">/ 100</span>
              </div>
            </div>

            {/* Status + factors */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-small font-bold capitalize ${
                  securityScore.status === 'excellent' || securityScore.status === 'good' ? 'text-semantic-success' :
                  securityScore.status === 'fair' ? 'text-semantic-warning' : 'text-semantic-danger'
                }`}>
                  {securityScore.status === 'excellent' && 'Excellent Protection'}
                  {securityScore.status === 'good' && 'Good Protection'}
                  {securityScore.status === 'fair' && 'Fair Protection'}
                  {securityScore.status === 'poor' && 'Poor Protection'}
                  {securityScore.status === 'critical' && 'Critical Risk'}
                </span>
              </div>

              {/* Factor bars */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {securityScore.factors.map((factor) => (
                  <div key={factor.id} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-caption text-text-secondary truncate">{factor.name}</span>
                        <span className="text-caption text-text-muted">{factor.score}/{factor.max}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--avs-border)] overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            factor.status === 'ok' ? 'bg-semantic-success' :
                            factor.status === 'warning' ? 'bg-semantic-warning' : 'bg-semantic-danger'
                          }`}
                          style={{ width: `${(factor.score / factor.max) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recommendations */}
          {securityScore.recommendations.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[var(--avs-border)]">
              <div className="text-caption font-medium text-text-secondary mb-2">Improve your score:</div>
              <div className="space-y-1.5">
                {securityScore.recommendations.slice(0, 3).map((rec) => (
                  <div key={rec.id} className="flex items-center gap-2">
                    <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                      rec.priority === 'high' ? 'bg-semantic-danger' :
                      rec.priority === 'medium' ? 'bg-semantic-warning' : 'bg-semantic-info'
                    }`} />
                    <span className="text-caption text-text-primary">{rec.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Status summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card variant="glass" className="p-4 text-center" data-testid="av-status-card">
          <ShieldCheckIcon className={`h-6 w-6 mx-auto mb-1 ${avStatus?.clamd_running ? 'text-semantic-success' : 'text-text-muted'}`} />
          <div className="text-section-title font-bold text-text-primary">
            {avStatus?.clamd_running ? 'Protected' : 'Not Active'}
          </div>
          <div className="text-caption text-text-secondary">AV Engine</div>
        </Card>
        <Card variant="glass" className="p-4 text-center" data-testid="rt-status-card">
          <EyeIcon className={`h-6 w-6 mx-auto mb-1 ${rtGuardEnabled ? 'text-semantic-success' : 'text-text-muted'}`} />
          <div className="text-section-title font-bold text-text-primary">
            {rtGuardEnabled ? 'Active' : 'Off'}
          </div>
          <div className="text-caption text-text-secondary">Real-Time Guard</div>
        </Card>
        <Card variant="glass" className="p-4 text-center" data-testid="threat-count-card">
          <ShieldExclamationIcon className={`h-6 w-6 mx-auto mb-1 ${threats.length > 0 ? 'text-semantic-danger' : 'text-semantic-success'}`} />
          <div className="text-section-title font-bold text-text-primary">{threats.length}</div>
          <div className="text-caption text-text-secondary">Threats Found</div>
        </Card>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-[var(--avs-border)]" data-testid="av-tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-small font-medium border-b-2 transition-colors ${
              activeTab === id
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
            data-testid={`av-tab-${id}`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'scan' && (
        <div className="space-y-4" data-testid="av-tab-scan-content">
          {/* Scheduled Scans */}
          <Card variant="glass" className="p-5" data-testid="av-scan-scheduler">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-brand-primary/10 p-2.5">
                  <ClockIcon className="h-5 w-5 text-brand-primary" />
                </div>
                <div>
                  <div className="text-small font-semibold text-text-primary">Scheduled Scans</div>
                  <div className="text-caption text-text-secondary">
                    Automatically scan your PC on a schedule. Threats are auto-quarantined.
                  </div>
                </div>
              </div>
              <button
                onClick={() => updateSchedule({ enabled: !schedule?.enabled })}
                disabled={scheduleLoading}
                className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${
                  schedule?.enabled ? 'bg-[var(--avs-brand-primary)]' : 'bg-[var(--avs-border)]'
                }`}
                data-testid="scan-schedule-toggle"
              >
                <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${schedule?.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {schedule?.enabled && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                {/* Frequency */}
                <div>
                  <label className="text-caption font-medium text-text-secondary block mb-1">Frequency</label>
                  <select
                    value={schedule.frequency}
                    onChange={(e) => updateSchedule({ frequency: e.target.value })}
                    disabled={scheduleLoading}
                    className="w-full rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-surface px-3 py-2 text-small text-text-primary"
                    data-testid="scan-schedule-frequency"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="on_logon">On Startup</option>
                  </select>
                </div>

                {/* Time (for daily/weekly) */}
                {schedule.frequency !== 'on_logon' && (
                  <div>
                    <label className="text-caption font-medium text-text-secondary block mb-1">Time</label>
                    <input
                      type="time"
                      value={schedule.time}
                      onChange={(e) => updateSchedule({ time: e.target.value })}
                      disabled={scheduleLoading}
                      className="w-full rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-surface px-3 py-2 text-small text-text-primary"
                      data-testid="scan-schedule-time"
                    />
                  </div>
                )}

                {/* Day of week (for weekly) */}
                {schedule.frequency === 'weekly' && (
                  <div>
                    <label className="text-caption font-medium text-text-secondary block mb-1">Day</label>
                    <select
                      value={schedule.day_of_week}
                      onChange={(e) => updateSchedule({ day_of_week: parseInt(e.target.value, 10) })}
                      disabled={scheduleLoading}
                      className="w-full rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-surface px-3 py-2 text-small text-text-primary"
                      data-testid="scan-schedule-day"
                    >
                      <option value={0}>Monday</option>
                      <option value={1}>Tuesday</option>
                      <option value={2}>Wednesday</option>
                      <option value={3}>Thursday</option>
                      <option value={4}>Friday</option>
                      <option value={5}>Saturday</option>
                      <option value={6}>Sunday</option>
                    </select>
                  </div>
                )}

                {/* Scan type */}
                <div>
                  <label className="text-caption font-medium text-text-secondary block mb-1">Scan Type</label>
                  <select
                    value={schedule.scan_type}
                    onChange={(e) => updateSchedule({ scan_type: e.target.value })}
                    disabled={scheduleLoading}
                    className="w-full rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-surface px-3 py-2 text-small text-text-primary"
                    data-testid="scan-schedule-type"
                  >
                    <option value="quick">Quick Scan (~2 min)</option>
                    <option value="full">Full Scan (~30 min)</option>
                  </select>
                </div>
              </div>
            )}

            {schedule?.enabled && schedule.last_run && (
              <div className="mt-3 text-caption text-text-muted" data-testid="scan-schedule-last-run">
                Last scheduled scan: {new Date(schedule.last_run).toLocaleDateString()}
              </div>
            )}

            {!isPro && schedule?.enabled && (
              <p className="text-caption text-brand-primary mt-3">Scheduled scans are a Professional feature.</p>
            )}
          </Card>

          {/* USB Auto-Scan */}
          <Card variant="glass" className="p-5" data-testid="av-usb-auto-scan">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-brand-primary/10 p-2.5">
                  <BoltIcon className="h-5 w-5 text-brand-primary" />
                </div>
                <div>
                  <div className="text-small font-semibold text-text-primary">USB Auto-Scan</div>
                  <div className="text-caption text-text-secondary">
                    Automatically scan USB drives and external devices when plugged in.
                  </div>
                </div>
              </div>
              <button
                onClick={() => toggleUsbAutoScan(!usbStatus?.running)}
                disabled={usbLoading}
                className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${
                  usbStatus?.running ? 'bg-[var(--avs-brand-primary)]' : 'bg-[var(--avs-border)]'
                }`}
                data-testid="usb-auto-scan-toggle"
              >
                <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${usbStatus?.running ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {usbStatus?.running && (
              <div className="flex items-center gap-4 mt-3">
                <Badge tone="success" data-testid="usb-active-badge">Active</Badge>
                <span className="text-caption text-text-muted">
                  Watching {usbStatus.devices_watched} device{usbStatus.devices_watched === 1 ? '' : 's'}
                </span>
                {usbStatus.scans_triggered > 0 && (
                  <span className="text-caption text-text-muted">
                    • {usbStatus.scans_triggered} scan{usbStatus.scans_triggered === 1 ? '' : 's'} triggered
                  </span>
                )}
              </div>
            )}

            {usbDevices.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="text-caption font-medium text-text-secondary">Connected Devices</div>
                {usbDevices.map((dev) => (
                  <div key={dev.drive_letter} className="flex items-center justify-between rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-surface px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-small font-medium text-text-primary">{dev.drive_letter}</span>
                      <span className="text-caption text-text-muted">{dev.label || 'Removable Drive'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-caption text-text-muted">{dev.filesystem}</span>
                      <span className="text-caption text-text-muted">{dev.size > 0 ? `${(dev.size / 1073741824).toFixed(1)} GB` : ''}</span>
                      <button
                        onClick={() => rpc.raw(RPC_METHODS.REALTIME_THREAT_USB_SCAN, { drive_letter: dev.drive_letter })}
                        className="text-caption text-brand-primary hover:underline"
                        data-testid={`usb-scan-${dev.drive_letter}`}
                      >
                        Scan Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!usbStatus?.running && (
              <p className="mt-3 text-caption text-text-muted">
                Enable to automatically scan any USB drive or external device the moment it&apos;s plugged in. Threats are auto-quarantined.
              </p>
            )}
          </Card>

          {/* Email Attachment Scanner */}
          <Card variant="glass" className="p-5" data-testid="av-email-scanner">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-brand-primary/10 p-2.5">
                  <ChartBarIcon className="h-5 w-5 text-brand-primary" />
                </div>
                <div>
                  <div className="text-small font-semibold text-text-primary">Email Attachment Scanner</div>
                  <div className="text-caption text-text-secondary">
                    Scan Outlook email attachments for malware, macros, and dangerous files.
                  </div>
                </div>
              </div>
              <button
                onClick={scanOutlookAttachments}
                disabled={emailScanning}
                className="px-4 py-2 rounded-[var(--avs-radius-md)] bg-[var(--avs-brand-primary)] text-white text-small font-medium hover:opacity-90 disabled:opacity-50"
                data-testid="email-scan-outlook-btn"
              >
                {emailScanning ? 'Scanning...' : 'Scan Outlook'}
              </button>
            </div>

            {emailScanResult && (
              <div className="mt-3" data-testid="email-scan-result">
                {emailScanResult.message ? (
                  <p className="text-caption text-text-muted">Email scan completed. See results below.</p>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mb-3">
                      <Badge tone={emailScanResult.threat_level === 'safe' ? 'success' : emailScanResult.threat_level === 'suspicious' ? 'warning' : 'danger'}>
                        {emailScanResult.threats_found > 0 ? `${emailScanResult.threats_found} threat${emailScanResult.threats_found === 1 ? '' : 's'} found` : 'Clean'}
                      </Badge>
                      <span className="text-caption text-text-muted">
                        Scanned {emailScanResult.scanned} attachment{emailScanResult.scanned === 1 ? '' : 's'}
                      </span>
                    </div>
                    {emailScanResult.results && emailScanResult.results.length > 0 && (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {emailScanResult.results.filter((r) => r.threat_level !== 'safe').map((r, i) => (
                          <div key={i} className="flex items-center justify-between rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-surface px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge tone={r.threat_level === 'malicious' ? 'danger' : 'warning'}>{r.threat_level}</Badge>
                              <span className="text-caption text-text-primary truncate">{r.file_info.name}</span>
                            </div>
                            <span className="text-micro text-text-muted shrink-0">{r.threats[0] || ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {!emailScanResult && (
              <p className="mt-3 text-caption text-text-muted">
                Automatically detects and scans your Outlook attachment folder for dangerous file types, macro-enabled documents, embedded executables, and double-extension tricks.
              </p>
            )}
          </Card>

          {/* Gaming Mode */}
          <Card variant="glass" className="p-5" data-testid="av-gaming-mode">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-brand-primary/10 p-2.5">
                  <FireIcon className="h-5 w-5 text-brand-primary" />
                </div>
                <div>
                  <div className="text-small font-semibold text-text-primary">Gaming Mode</div>
                  <div className="text-caption text-text-secondary">
                    Pause scans and notifications while gaming or watching full-screen media.
                  </div>
                </div>
              </div>
              <button
                onClick={toggleGameMode}
                disabled={gameModeLoading}
                className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${
                  gameModeActive ? 'bg-[var(--avs-brand-primary)]' : 'bg-[var(--avs-border)]'
                }`}
                data-testid="gaming-mode-toggle"
              >
                <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${gameModeActive ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {gameModeActive && (
              <div className="flex items-center gap-2 mt-3">
                <Badge tone="success" data-testid="gaming-active-badge">Active</Badge>
                <span className="text-caption text-text-muted">
                  Scans paused • Notifications silenced • Real-time protection stays on
                </span>
              </div>
            )}

            {!gameModeActive && (
              <p className="mt-3 text-caption text-text-muted">
                When active, scheduled scans and non-critical notifications are paused. Real-time protection continues running for safety. Auto-detects full-screen apps when enabled in AI Features.
              </p>
            )}
          </Card>

          {/* Startup Scan */}
          <Card variant="glass" className="p-5" data-testid="av-startup-scan">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-brand-primary/10 p-2.5">
                  <ShieldCheckIcon className="h-5 w-5 text-brand-primary" />
                </div>
                <div>
                  <div className="text-small font-semibold text-text-primary">Startup Scan</div>
                  <div className="text-caption text-text-secondary">
                    Auto-scan startup items and boot sector on every system boot.
                  </div>
                </div>
              </div>
              <button
                onClick={() => toggleStartupScan(!startupScanStatus?.enabled)}
                disabled={startupScanLoading}
                className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${
                  startupScanStatus?.enabled ? 'bg-[var(--avs-brand-primary)]' : 'bg-[var(--avs-border)]'
                }`}
                data-testid="startup-scan-toggle"
              >
                <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${startupScanStatus?.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={runStartupScanNow}
                disabled={startupScanLoading || startupScanStatus?.scan_running}
                className="px-3 py-1.5 rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] text-small text-text-primary hover:bg-surface-hover disabled:opacity-50"
                data-testid="startup-scan-run-now"
              >
                {startupScanStatus?.scan_running ? 'Scanning...' : 'Scan Now'}
              </button>

              {startupScanStatus?.enabled && (
                <Badge tone="success" data-testid="startup-scan-enabled-badge">Auto-scan on boot</Badge>
              )}

              {startupScanStatus?.last_scan && (
                <span className="text-caption text-text-muted">
                  Last: {startupScanStatus.last_scan.files_scanned} files • {startupScanStatus.last_scan.threats_found} threats
                  {startupScanStatus.last_scan.boot_sector_scanned && ' • MBR scanned'}
                </span>
              )}
            </div>

            {!startupScanStatus?.enabled && (
              <p className="mt-3 text-caption text-text-muted">
                Scans all startup programs, registry Run keys, and the Master Boot Record for bootkits and persistent malware. Runs automatically 60 seconds after system boot.
              </p>
            )}
          </Card>

          {/* Scan mode selector + Scan modal */}
          <Card variant="glass" className="p-5" data-testid="av-scan-mode-selector">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-brand-primary/10 p-2.5">
                  <BugAntIcon className="h-5 w-5 text-brand-primary" />
                </div>
                <div>
                  <div className="text-small font-semibold text-text-primary">Manual Scan</div>
                  <div className="text-caption text-text-secondary">
                    Choose a scan type and run it now. Threats are auto-quarantined.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] overflow-hidden" data-testid="scan-mode-toggle">
                  <button
                    onClick={() => setScanMode('quick')}
                    className={`px-3 py-1.5 text-small font-medium transition-colors ${
                      scanMode === 'quick' ? 'bg-brand-primary text-white' : 'bg-surface text-text-secondary hover:text-text-primary'
                    }`}
                    data-testid="scan-mode-quick"
                  >
                    Quick
                  </button>
                  <button
                    onClick={() => setScanMode('full')}
                    className={`px-3 py-1.5 text-small font-medium transition-colors ${
                      scanMode === 'full' ? 'bg-brand-primary text-white' : 'bg-surface text-text-secondary hover:text-text-primary'
                    }`}
                    data-testid="scan-mode-full"
                  >
                    Full
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  leftIcon={<BoltIcon className="h-4 w-4" />}
                  onClick={() => setScanModalOpen(true)}
                  data-testid="manual-scan-btn"
                >
                  Start Scan
                </Button>
              </div>
            </div>
          </Card>

          {scanModalOpen && (
            <Modal open={scanModalOpen} onClose={handleModalClose} title="Security Scan" size="xl">
              <ScanView module="security" mode={scanMode} onClose={handleModalClose} />
            </Modal>
          )}

          {/* Post-Scan Summary Modal */}
          {showSummaryModal && scanSummary && (
            <Modal open={showSummaryModal} onClose={() => setShowSummaryModal(false)} title="Scan Summary Report" size="lg">
              <div className="space-y-4" data-testid="scan-summary-modal">
                {/* Posture banner */}
                <div className={`p-4 rounded-[var(--avs-radius-md)] border ${
                  scanSummary.posture.color === 'success' ? 'bg-semantic-success/5 border-semantic-success/20' :
                  scanSummary.posture.color === 'warning' ? 'bg-semantic-warning/5 border-semantic-warning/20' :
                  'bg-semantic-danger/5 border-semantic-danger/20'
                }`}>
                  <div className="flex items-center gap-3">
                    {scanSummary.posture.status === 'clean' ? (
                      <ShieldCheckIcon className="h-8 w-8 text-semantic-success" />
                    ) : (
                      <ShieldExclamationIcon className="h-8 w-8 text-semantic-danger" />
                    )}
                    <div>
                      <div className="text-small font-bold text-text-primary">{scanSummary.posture.label}</div>
                      <div className="text-caption text-text-secondary">
                        Security Score: {scanSummary.posture.score}/100
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="p-3 rounded border border-[var(--avs-border)]">
                    <div className="text-caption text-text-muted">Scan Type</div>
                    <div className="text-small font-bold text-text-primary capitalize">{scanSummary.scan_type}</div>
                  </div>
                  <div className="p-3 rounded border border-[var(--avs-border)]">
                    <div className="text-caption text-text-muted">Duration</div>
                    <div className="text-small font-bold text-text-primary">
                      {Math.floor(scanSummary.duration_seconds / 60)}m {scanSummary.duration_seconds % 60}s
                    </div>
                  </div>
                  <div className="p-3 rounded border border-[var(--avs-border)]">
                    <div className="text-caption text-text-muted">Files Scanned</div>
                    <div className="text-small font-bold text-text-primary">{scanSummary.files_scanned}</div>
                  </div>
                  <div className="p-3 rounded border border-[var(--avs-border)]">
                    <div className="text-caption text-text-muted">Threats</div>
                    <div className={`text-small font-bold ${scanSummary.threats_found > 0 ? 'text-semantic-danger' : 'text-semantic-success'}`}>
                      {scanSummary.threats_found}
                    </div>
                  </div>
                </div>

                {/* Threat breakdown */}
                {scanSummary.threats_found > 0 && (
                  <div>
                    <div className="text-small font-semibold text-text-primary mb-2">Threat Breakdown</div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {Object.entries(scanSummary.threat_breakdown.by_category).map(([cat, count]) => (
                        <Badge key={cat} tone="neutral">{cat}: {count}</Badge>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {scanSummary.threat_breakdown.quarantined > 0 && (
                        <Badge tone="success">Quarantined: {scanSummary.threat_breakdown.quarantined}</Badge>
                      )}
                      {scanSummary.threat_breakdown.pending > 0 && (
                        <Badge tone="warning">Pending: {scanSummary.threat_breakdown.pending}</Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Top threats */}
                {scanSummary.top_threats.length > 0 && (
                  <div>
                    <div className="text-small font-semibold text-text-primary mb-2">Top Threats</div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {scanSummary.top_threats.map((threat, i) => (
                        <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded border border-[var(--avs-border)]">
                          <ShieldExclamationIcon className="h-4 w-4 text-semantic-danger shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-small text-text-primary truncate">{threat.name}</div>
                            <div className="text-caption text-text-muted truncate">{threat.path}</div>
                          </div>
                          <Badge tone={threat.severity === 'high' ? 'danger' : 'warning'}>{threat.severity}</Badge>
                          {threat.quarantined && <Badge tone="success">Q</Badge>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                {scanSummary.recommendations.length > 0 && (
                  <div>
                    <div className="text-small font-semibold text-text-primary mb-2">Recommendations</div>
                    <div className="space-y-2">
                      {scanSummary.recommendations.map((rec) => (
                        <div key={rec.id} className={`p-2 rounded border ${
                          rec.priority === 'urgent' ? 'border-semantic-danger/30 bg-semantic-danger/5' :
                          rec.priority === 'high' ? 'border-semantic-warning/30 bg-semantic-warning/5' :
                          'border-[var(--avs-border)]'
                        }`}>
                          <div className="text-small font-medium text-text-primary">{rec.title}</div>
                          <div className="text-caption text-text-muted">{rec.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowSummaryModal(false)}>Close</Button>
                  <Button variant="primary" size="sm" onClick={() => { setShowSummaryModal(false); setActiveTab('quarantine'); }}>
                    {scanSummary.threats_found > 0 ? 'Review Threats' : 'Done'}
                  </Button>
                </div>
              </div>
            </Modal>
          )}

          {/* Recent scan summaries */}
          {recentSummaries.length > 0 && (
            <Card variant="glass" className="p-4" data-testid="scan-history-card">
              <div className="text-small font-semibold text-text-primary mb-3">Recent Scan Reports</div>
              <div className="space-y-2">
                {recentSummaries.slice().reverse().map((s) => (
                  <div key={s.report_id} className="flex items-center gap-3 py-2 px-3 rounded border border-[var(--avs-border)]">
                    <div className={`h-2 w-2 rounded-full ${
                      s.posture.status === 'clean' ? 'bg-semantic-success' :
                      s.posture.status === 'critical' ? 'bg-semantic-danger' :
                      'bg-semantic-warning'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-small text-text-primary capitalize">{s.scan_type} Scan</div>
                      <div className="text-caption text-text-muted">
                        {s.files_scanned} files • {s.threats_found} threats • Score: {s.posture.score}
                      </div>
                    </div>
                    <Badge tone={s.posture.status === 'clean' ? 'success' : 'warning'}>
                      {s.posture.label}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'realtime' && (
        <div className="space-y-4" data-testid="av-tab-realtime-content">
          {/* Real-time protection toggle */}
          <Card variant="glass" className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`rounded-[var(--avs-radius-md)] p-2.5 ${rtGuardEnabled ? 'bg-semantic-success/10' : 'bg-surface-muted'}`}>
                  <EyeIcon className={`h-6 w-6 ${rtGuardEnabled ? 'text-semantic-success' : 'text-text-muted'}`} />
                </div>
                <div>
                  <div className="text-small font-semibold text-text-primary">Real-Time Protection</div>
                  <p className="text-caption text-text-secondary">
                    {rtGuardEnabled
                      ? 'Active — AVS AI Shield is protecting your PC in real-time.'
                      : 'Enable to monitor file activity and block threats in real-time.'}
                  </p>
                </div>
              </div>
              <button
                onClick={toggleRtGuard}
                disabled={rtGuardLoading}
                className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${
                  rtGuardEnabled ? 'bg-[var(--avs-brand-primary)]' : 'bg-[var(--avs-border)]'
                }`}
                data-testid="rt-protection-toggle"
              >
                <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${rtGuardEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </Card>

          {/* AV Engine status — auto-setup, no button needed */}
          <Card variant="glass" className="p-5" data-testid="av-engine-card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`rounded-[var(--avs-radius-md)] p-2.5 ${avStatus?.clamd_running ? 'bg-semantic-success/10' : avStatus?.installed ? 'bg-semantic-warning/10' : 'bg-surface-muted'}`}>
                  <ShieldCheckIcon className={`h-6 w-6 ${avStatus?.clamd_running ? 'text-semantic-success' : avStatus?.installed ? 'text-semantic-warning' : 'text-text-muted'}`} />
                </div>
                <div>
                  <div className="text-small font-semibold text-text-primary">AVS AI Shield Antivirus Engine</div>
                  <p className="text-caption text-text-secondary">
                    {avStatus?.clamd_running
                      ? 'Active — Your PC is protected'
                      : avStatus?.installed
                        ? 'Starting automatically...'
                        : 'Preparing antivirus engine...'}
                  </p>
                </div>
              </div>
              {avStatus?.clamd_running ? (
                <Badge tone="success">Active</Badge>
              ) : avStatus?.installed ? (
                <Badge tone="warning">Starting</Badge>
              ) : (
                <Badge tone="neutral"><ArrowPathIcon className="h-3 w-3 inline mr-1 animate-spin" />Preparing</Badge>
              )}
            </div>

            {avStatus?.clamd_running && (
              <div className="flex items-center gap-2 mt-2">
                <Badge tone="success">Protected</Badge>
                <span className="text-caption text-text-muted">Auto-update enabled</span>
              </div>
            )}

            {!avStatus?.clamd_running && setupStatus?.setup_in_progress && (
              <div className="mt-3 p-3 rounded bg-semantic-info/5 border border-semantic-info/20" data-testid="av-setup-progress">
                <div className="flex items-center gap-2">
                  <ArrowPathIcon className="h-4 w-4 animate-spin text-semantic-info" />
                  <span className="text-small font-medium text-text-primary">
                    {setupStatus.setup_progress?.phase === 'downloading_signatures'
                      ? 'Preparing antivirus engine...'
                      : setupStatus.setup_progress?.phase === 'copying_bundled'
                        ? 'Setting up antivirus engine...'
                        : setupStatus.setup_progress?.phase === 'starting_engine'
                          ? 'Starting antivirus engine...'
                          : setupStatus.setup_progress?.phase === 'configuring'
                            ? 'Configuring antivirus engine...'
                            : 'Preparing antivirus engine...'}
                  </span>
                </div>
                <p className="text-caption text-text-muted mt-1">
                  This happens once. Future scans start instantly with auto-updated definitions.
                </p>
              </div>
            )}

            {!avStatus?.clamd_running && !setupStatus?.setup_in_progress && (
              <p className="mt-2 text-caption text-text-muted" data-testid="av-auto-setup-msg">
                The antivirus engine starts automatically with AVS AI Shield. Virus definitions download in the background and update daily.
              </p>
            )}
          </Card>
        </div>
      )}

      {activeTab === 'quarantine' && (
        <div className="space-y-4" data-testid="av-tab-quarantine-content">
          <Card variant="glass" className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-small font-semibold text-text-primary">
                Quarantined Threats {threats.length > 0 && `(${threats.length})`}
              </div>
              <div className="flex items-center gap-2">
                {threats.length > 0 && (
                  <>
                    <Button variant="ghost" size="sm" onClick={handleRestoreAll} disabled={batchLoading} data-testid="quarantine-restore-all">
                      Restore All
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleDeleteAll} disabled={batchLoading} data-testid="quarantine-delete-all">
                      Delete All
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" onClick={refreshThreats} disabled={threatsLoading} leftIcon={<ArrowPathIcon className={`h-4 w-4 ${threatsLoading ? 'animate-spin' : ''}`} />}>
                  Refresh
                </Button>
              </div>
            </div>

            {threats.length > 0 && selectedThreats.size > 0 && (
              <div className="flex items-center gap-3 mb-3 p-2 rounded bg-brand-primary/5 border border-brand-primary/20" data-testid="quarantine-batch-bar">
                <span className="text-small text-text-primary">{selectedThreats.size} selected</span>
                <Button variant="ghost" size="sm" onClick={handleDeleteSelected} disabled={batchLoading} data-testid="quarantine-delete-selected">
                  Delete Selected
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedThreats(new Set())}>
                  Clear
                </Button>
              </div>
            )}

            {threats.length === 0 ? (
              <div className="text-center py-12">
                <ShieldCheckIcon className="h-12 w-12 text-semantic-success mx-auto mb-3" />
                <p className="text-small text-text-secondary">No threats in quarantine. Your PC is clean.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2 px-3">
                  <input
                    type="checkbox"
                    checked={selectedThreats.size === threats.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-[var(--avs-border)]"
                    data-testid="quarantine-select-all"
                  />
                  <span className="text-caption text-text-muted">Select all</span>
                </div>
                <div className="space-y-2">
                  {threats.map((threat) => (
                    <div key={threat.id} className="flex items-center gap-3 py-2 px-3 rounded border border-[var(--avs-border)]">
                      <input
                        type="checkbox"
                        checked={selectedThreats.has(threat.id)}
                        onChange={() => toggleThreatSelection(threat.id)}
                        className="h-4 w-4 rounded border-[var(--avs-border)] shrink-0"
                        data-testid={`quarantine-select-${threat.id}`}
                      />
                      <ShieldExclamationIcon className="h-5 w-5 text-semantic-danger shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-small font-medium text-text-primary truncate">{threat.name}</div>
                        <div className="text-caption text-text-muted truncate">{threat.path}</div>
                      </div>
                      <Badge tone={threat.severity === 'high' ? 'danger' : 'warning'}>{threat.severity}</Badge>
                      <Button variant="ghost" size="sm" onClick={() => handleRestoreThreat(threat.id)}>Restore</Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteThreat(threat.id)}>Delete</Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {activeTab === 'statistics' && (
        <div className="space-y-4" data-testid="av-tab-statistics-content">
          {threatStats ? (
            <>
              {/* Overview stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card variant="glass" className="p-4 text-center" data-testid="stat-total-scans">
                  <ChartBarIcon className="h-6 w-6 text-brand-primary mx-auto mb-1" />
                  <div className="text-2xl font-bold text-text-primary">{threatStats.total_scans}</div>
                  <div className="text-caption text-text-muted">Total Scans</div>
                </Card>
                <Card variant="glass" className="p-4 text-center" data-testid="stat-total-threats">
                  <ShieldExclamationIcon className="h-6 w-6 text-semantic-danger mx-auto mb-1" />
                  <div className="text-2xl font-bold text-text-primary">{threatStats.total_threats_detected}</div>
                  <div className="text-caption text-text-muted">Threats Detected</div>
                </Card>
                <Card variant="glass" className="p-4 text-center" data-testid="stat-files-scanned">
                  <DocumentTextIcon className="h-6 w-6 text-brand-primary mx-auto mb-1" />
                  <div className="text-2xl font-bold text-text-primary">{threatStats.total_files_scanned.toLocaleString()}</div>
                  <div className="text-caption text-text-muted">Files Scanned</div>
                </Card>
                <Card variant="glass" className="p-4 text-center" data-testid="stat-quarantine">
                  <LockClosedIcon className="h-6 w-6 text-semantic-warning mx-auto mb-1" />
                  <div className="text-2xl font-bold text-text-primary">{threatStats.current_quarantine_count}</div>
                  <div className="text-caption text-text-muted">In Quarantine</div>
                </Card>
              </div>

              {/* Clean vs infected */}
              <Card variant="glass" className="p-5" data-testid="stat-scan-breakdown">
                <div className="text-small font-semibold text-text-primary mb-3">Scan Results</div>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-caption text-text-secondary">Clean Scans</span>
                      <span className="text-small font-bold text-semantic-success">{threatStats.clean_scans}</span>
                    </div>
                    <div className="h-3 rounded-full bg-[var(--avs-border)] overflow-hidden">
                      <div className="h-full bg-semantic-success" style={{ width: `${threatStats.total_scans > 0 ? (threatStats.clean_scans / threatStats.total_scans) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-caption text-text-secondary">Infected Scans</span>
                      <span className="text-small font-bold text-semantic-danger">{threatStats.infected_scans}</span>
                    </div>
                    <div className="h-3 rounded-full bg-[var(--avs-border)] overflow-hidden">
                      <div className="h-full bg-semantic-danger" style={{ width: `${threatStats.total_scans > 0 ? (threatStats.infected_scans / threatStats.total_scans) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
              </Card>

              {/* Threats by category and severity */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card variant="glass" className="p-5" data-testid="stat-by-category">
                  <div className="text-small font-semibold text-text-primary mb-3">Threats by Category</div>
                  {Object.keys(threatStats.by_category).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(threatStats.by_category).sort((a, b) => b[1] - a[1]).map(([cat, count]) => {
                        const maxCount = Math.max(...Object.values(threatStats.by_category));
                        return (
                          <div key={cat}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-caption text-text-secondary capitalize">{cat}</span>
                              <span className="text-small font-bold text-text-primary">{count}</span>
                            </div>
                            <div className="h-2 rounded-full bg-[var(--avs-border)] overflow-hidden">
                              <div className="h-full bg-brand-primary" style={{ width: `${(count / maxCount) * 100}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-caption text-text-muted">No threats detected yet.</p>
                  )}
                </Card>

                <Card variant="glass" className="p-5" data-testid="stat-by-severity">
                  <div className="text-small font-semibold text-text-primary mb-3">Threats by Severity</div>
                  {Object.keys(threatStats.by_severity).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(threatStats.by_severity).sort((a, b) => b[1] - a[1]).map(([sev, count]) => {
                        const maxCount = Math.max(...Object.values(threatStats.by_severity));
                        const color = sev === 'critical' || sev === 'high' ? 'bg-semantic-danger' : sev === 'medium' ? 'bg-semantic-warning' : 'bg-semantic-info';
                        return (
                          <div key={sev}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-caption text-text-secondary capitalize">{sev}</span>
                              <span className="text-small font-bold text-text-primary">{count}</span>
                            </div>
                            <div className="h-2 rounded-full bg-[var(--avs-border)] overflow-hidden">
                              <div className={`h-full ${color}`} style={{ width: `${(count / maxCount) * 100}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-caption text-text-muted">No threats detected yet.</p>
                  )}
                </Card>
              </div>

              {/* Detection sources */}
              <Card variant="glass" className="p-5" data-testid="stat-by-source">
                <div className="text-small font-semibold text-text-primary mb-3">Detection Sources</div>
                {Object.keys(threatStats.by_source).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(threatStats.by_source).sort((a, b) => b[1] - a[1]).map(([src, count]) => (
                      <div key={src} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-[var(--avs-border)]">
                        <span className="text-small text-text-primary capitalize">{src}</span>
                        <Badge tone="neutral">{count}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-caption text-text-muted">No detections yet.</p>
                )}
              </Card>

              {/* Top threats */}
              {threatStats.top_threats.length > 0 && (
                <Card variant="glass" className="p-5" data-testid="stat-top-threats">
                  <div className="text-small font-semibold text-text-primary mb-3">Top Threat Names</div>
                  <div className="space-y-2">
                    {threatStats.top_threats.map((threat, i) => (
                      <div key={i} className="flex items-center gap-3 py-1.5 px-2 rounded border border-[var(--avs-border)]">
                        <span className="text-caption text-text-muted w-6">#{i + 1}</span>
                        <ShieldExclamationIcon className="h-4 w-4 text-semantic-danger shrink-0" />
                        <span className="text-small text-text-primary flex-1 truncate">{threat.name}</span>
                        <Badge tone="danger">{threat.count}x</Badge>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Recent activity */}
              <Card variant="glass" className="p-5" data-testid="stat-recent-activity">
                <div className="text-small font-semibold text-text-primary mb-3">Recent Activity</div>
                {threatStats.recent_activity.length > 0 ? (
                  <div className="space-y-2">
                    {threatStats.recent_activity.map((activity, i) => (
                      <div key={i} className="flex items-center gap-3 py-2 px-3 rounded border border-[var(--avs-border)]">
                        {activity.threats_found > 0 ? (
                          <ShieldExclamationIcon className="h-4 w-4 text-semantic-danger shrink-0" />
                        ) : (
                          <ShieldCheckIcon className="h-4 w-4 text-semantic-success shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="text-small text-text-primary capitalize">{activity.scan_type} scan</span>
                          <span className="text-caption text-text-muted ml-2">
                            {activity.files_scanned} files • {activity.threats_found} threats
                          </span>
                        </div>
                        <span className="text-caption text-text-muted shrink-0">
                          {activity.date ? new Date(activity.date).toLocaleDateString() : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-caption text-text-muted">No scan activity yet. Run a scan to see statistics.</p>
                )}
              </Card>
            </>
          ) : (
            <Card variant="glass" className="p-8 text-center">
              <p className="text-small text-text-secondary">Loading statistics...</p>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'advanced' && (
        <div className="space-y-4" data-testid="av-tab-advanced-content">
          {/* Scan Exclusions by File Type */}
          <Card variant="glass" className="p-5" data-testid="av-scan-exclusions">
            <div className="flex items-center gap-3 mb-3">
              <ChartBarIcon className="h-6 w-6 text-brand-primary" />
              <div>
                <div className="text-small font-semibold text-text-primary">Scan Exclusions by File Type</div>
                <p className="text-caption text-text-secondary">Skip specific file types during scans to speed up full system scans.</p>
              </div>
            </div>

            {/* Add new extension */}
            <div className="flex items-center gap-2 mb-4">
              <input
                type="text"
                value={newExtension}
                onChange={(e) => setNewExtension(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addExcludedExtension(); }}
                placeholder=".ext (e.g. .mp4)"
                className="w-32 px-3 py-2 rounded border border-[var(--avs-border)] bg-surface text-small text-text-primary"
                data-testid="exclusion-input"
              />
              <Button variant="primary" size="sm" onClick={addExcludedExtension} disabled={excludeLoading || !newExtension.trim()} data-testid="exclusion-add-btn">
                Add
              </Button>
              <span className="text-caption text-text-muted ml-2">
                Excluded files are skipped entirely — no scanning, no hashing.
              </span>
            </div>

            {/* Current exclusions */}
            {excludedExtensions.length > 0 ? (
              <div className="flex flex-wrap gap-2" data-testid="exclusion-list">
                {excludedExtensions.map((ext) => (
                  <div key={ext} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-surface border border-[var(--avs-border)]" data-testid={`exclusion-tag-${ext}`}>
                    <span className="text-small text-text-primary">{ext}</span>
                    <button
                      onClick={() => removeExcludedExtension(ext)}
                      disabled={excludeLoading}
                      className="text-text-muted hover:text-semantic-danger text-small"
                      data-testid={`exclusion-remove-${ext}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-caption text-text-muted">No file types excluded. All files will be scanned.</p>
            )}

            {/* Quick-add suggestions */}
            <div className="mt-4 pt-3 border-t border-[var(--avs-border)]">
              <div className="text-caption font-medium text-text-secondary mb-2">Quick add:</div>
              <div className="flex flex-wrap gap-2">
                {['.mp4', '.mkv', '.mp3', '.jpg', '.png', '.txt', '.pdf', '.zip'].map((ext) => (
                  !excludedExtensions.includes(ext) && (
                    <button
                      key={ext}
                      onClick={() => { setNewExtension(ext); setTimeout(addExcludedExtension, 0); }}
                      disabled={excludeLoading}
                      className="px-2.5 py-1 rounded-full bg-surface-hover text-small text-text-secondary hover:bg-surface border border-[var(--avs-border)]"
                      data-testid={`exclusion-quick-${ext}`}
                    >
                      + {ext}
                    </button>
                  )
                ))}
              </div>
            </div>
          </Card>

          {/* Safe Folder */}
          <Card variant="glass" className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <LockClosedIcon className="h-6 w-6 text-brand-primary" />
              <div>
                <div className="text-small font-semibold text-text-primary">Safe Folder — Ransomware Protection</div>
                <p className="text-caption text-text-secondary">Monitor protected folders for unauthorized mass encryption or deletion.</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => window.location.hash = '#/safe-folder'} data-testid="av-safe-folder-btn">
              Configure Safe Folder
            </Button>
          </Card>

          {/* Advanced Security */}
          <Card variant="glass" className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <ShieldExclamationIcon className="h-6 w-6 text-brand-primary" />
              <div>
                <div className="text-small font-semibold text-text-primary">Advanced Security Tools</div>
                <p className="text-caption text-text-secondary">Boot sector scanning, email scanner, web shield, behavioral sandbox, and ML anomaly detection.</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => window.location.hash = '#/advanced-security'} data-testid="av-advanced-security-btn">
              Open Advanced Security
            </Button>
          </Card>

          {/* Scan history */}
          <Card variant="glass" className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <ClockIcon className="h-6 w-6 text-brand-primary" />
              <div>
                <div className="text-small font-semibold text-text-primary">Scan History & Timeline</div>
                <p className="text-caption text-text-secondary">View past scan results, threat detections, and security events over time.</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => window.location.hash = '#/reports-timeline'} data-testid="av-scan-history-btn">
              View Timeline
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}

import { Card, Button, Badge } from '@avs/ui';
import { useTheme } from '@avs/ui';
import { PageHeader } from '../components/PageHeader';
import type { ThemeMode } from '@avs/shared/types';
import { useEffect, useState } from 'react';
import { useEdition } from '../config/EditionManager';
import { getVersionString, getBuildString, getChannelString, getEditionString } from '../config/version';
import { useUpgradeDialog } from '../components/UpgradeDialog';

interface VerificationLog {
  id: string;
  timestamp: number;
  moduleId: string;
  action: string;
  rpcMethod: string;
  before?: number;
  after?: number;
  durationMs: number;
  success: boolean;
  message?: string;
}

const THEMES: readonly { id: ThemeMode; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

/**
 * SettingsPage — the only page that ships with interactive controls
 * in this initial scaffold. Additional sections (Language, Updates,
 * License, Advanced) will be plugged in as their subsystems arrive.
 */
const DEV_STORAGE_KEY = 'avs-developer-mode';
const LOGS_STORAGE_KEY = 'avs-verification-logs';

export default function SettingsPage() {
  const { mode, setMode } = useTheme();
  const [devMode, setDevMode] = useState(false);
  const [logs, setLogs] = useState<VerificationLog[]>([]);
  const edition = useEdition();
  const { show: showUpgrade } = useUpgradeDialog();

  useEffect(() => {
    try {
      setDevMode(typeof window !== 'undefined' && window.localStorage.getItem(DEV_STORAGE_KEY) === 'true');
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(LOGS_STORAGE_KEY) : null;
      setLogs(raw ? (JSON.parse(raw) as VerificationLog[]) : []);
    } catch {
      setLogs([]);
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === DEV_STORAGE_KEY) setDevMode(e.newValue === 'true');
      if (e.key === LOGS_STORAGE_KEY) {
        try {
          setLogs(e.newValue ? (JSON.parse(e.newValue) as VerificationLog[]) : []);
        } catch {
          setLogs([]);
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleDevMode = () => {
    const next = !devMode;
    setDevMode(next);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(DEV_STORAGE_KEY, String(next));
      }
    } catch {
      // ignore
    }
  };

  return (
    <div data-testid="page-settings">
      <PageHeader
        title="Settings"
        description="Configure appearance, updates, and advanced behaviour."
      />

      <div className="space-y-4">
        <Card title="Appearance">
          <div className="flex flex-wrap items-center gap-2">
            {THEMES.map((t) => (
              <Button
                key={t.id}
                variant={mode === t.id ? 'primary' : 'secondary'}
                onClick={() => setMode(t.id)}
                data-testid={`settings-theme-${t.id}`}
              >
                {t.label}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-xs text-text-muted">
            Theme is stored locally and re-applied on next launch.
          </p>
        </Card>

        <Card title="Language">
          <p className="text-sm text-text-secondary">
            English is currently the default. Additional locales will be enabled once
            translations complete.
          </p>
        </Card>

        <Card title="Application Edition">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary">{getEditionString()}</span>
                <Badge tone={edition === 'free' ? 'neutral' : 'brand'}>
                  {edition.toUpperCase()}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                {edition === 'free'
                  ? 'Free edition includes basic junk cleaning, startup management, privacy cleaning, and disk analysis.'
                  : 'Pro edition includes all features with priority support.'}
              </p>
            </div>
            {edition === 'free' && (
              <Button variant="primary" onClick={() => showUpgrade('Settings')} data-testid="settings-upgrade">
                Upgrade to Pro
              </Button>
            )}
          </div>
        </Card>

        <Card title="Version">
          <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
            <div>
              <dt className="text-text-muted">Version</dt>
              <dd className="font-medium text-text-primary">{getVersionString()}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Build</dt>
              <dd className="font-medium text-text-primary">{getBuildString()}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Channel</dt>
              <dd className="font-medium text-text-primary">{getChannelString()}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Update Preferences">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-text-primary">Check for updates automatically</div>
                <p className="text-xs text-text-secondary">Not enabled in this build. Future versions will support automatic update checks.</p>
              </div>
              <Button variant="secondary" disabled data-testid="settings-auto-update-toggle">
                Disabled
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-text-primary">Update channel</div>
                <p className="text-xs text-text-secondary">Stable channel is recommended for most users.</p>
              </div>
              <Badge tone="brand">Stable</Badge>
            </div>
          </div>
        </Card>

        <Card title="Telemetry">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-text-primary">Anonymous usage data</div>
              <p className="text-xs text-text-secondary">Help improve AVS PC Optimizer by sending anonymous diagnostics. Future feature.</p>
            </div>
            <Button variant="secondary" disabled data-testid="settings-telemetry-toggle">
              Disabled
            </Button>
          </div>
        </Card>

        <Card title="License">
          <p className="text-sm text-text-secondary">
            {edition === 'free'
              ? 'Currently running the Free edition. License activation will be available in a future update.'
              : 'Pro edition is active. License management will be available here once licensing is enabled.'}
          </p>
        </Card>

        <Card title="Developer">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-text-primary">Developer Verification Mode</div>
              <p className="text-xs text-text-secondary">
                Shows every RPC call, backend function, files deleted, entries disabled and before/after values.
              </p>
            </div>
            <Button variant={devMode ? 'primary' : 'secondary'} onClick={toggleDevMode}>
              {devMode ? 'Enabled' : 'Disabled'}
            </Button>
          </div>

          {devMode && (
            <div className="mt-4 border-t border-border pt-4">
              <div className="text-sm font-medium text-text-primary mb-2">Verification Log ({logs.length})</div>
              {logs.length === 0 ? (
                <p className="text-sm text-text-secondary">No verification data yet. Run a Smart Health Scan optimization to populate this log.</p>
              ) : (
                <div className="max-h-96 overflow-auto border border-border rounded-md">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-surface-muted text-text-secondary sticky top-0">
                      <tr>
                        <th className="p-2">Time</th>
                        <th className="p-2">Module</th>
                        <th className="p-2">Action</th>
                        <th className="p-2">RPC</th>
                        <th className="p-2">Before</th>
                        <th className="p-2">After</th>
                        <th className="p-2">Duration</th>
                        <th className="p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} className="border-t border-border">
                          <td className="p-2 tabular-nums">{new Date(log.timestamp).toLocaleTimeString()}</td>
                          <td className="p-2">{log.moduleId}</td>
                          <td className="p-2">{log.action}</td>
                          <td className="p-2 font-mono">{log.rpcMethod}</td>
                          <td className="p-2 tabular-nums">{log.before ?? '-'}</td>
                          <td className="p-2 tabular-nums">{log.after ?? '-'}</td>
                          <td className="p-2 tabular-nums">{log.durationMs}ms</td>
                          <td className={`p-2 ${log.success ? 'text-semantic-success' : 'text-semantic-danger'}`}>
                            {log.success ? 'OK' : 'FAIL'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

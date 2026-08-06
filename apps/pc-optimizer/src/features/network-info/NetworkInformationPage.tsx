/**
 * NetworkInformationPage — detailed network adapter and connection info.
 *
 * Shows:
 *   - Network adapters with IP, MAC, speed, status
 *   - Active TCP/UDP connections with process names
 *   - Network I/O statistics
 *   - DNS servers
 *   - Ping utility
 */
import { useEffect, useMemo } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleEmptyState, ModuleLoadingState, ModuleErrorBanner } from '../../components/ModuleStates';
import {
  WifiIcon,
  ArrowPathIcon,
  GlobeAltIcon,
  ChartBarIcon,
  CommandLineIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

interface NetworkAdapter {
  name: string;
  isup: boolean;
  speedMbps: number | null;
  mtu: number;
  duplex: string;
  ipv4: string | null;
  ipv6: string | null;
  mac: string | null;
  bytesSent: number;
  bytesRecv: number;
  packetsSent: number;
  packetsRecv: number;
  errorsIn: number;
  errorsOut: number;
  dropsIn: number;
  dropsOut: number;
}

interface NetworkConnection {
  fd: number;
  family: string;
  type: string;
  localAddress: string | null;
  remoteAddress: string | null;
  status: string;
  pid: number;
  processName: string | null;
}

interface NetworkState {
  loading: boolean;
  error: string | null;
  adapters: NetworkAdapter[];
  connections: NetworkConnection[];
  stats: { bytesSent: number; bytesRecv: number; packetsSent: number; packetsRecv: number; errorsIn: number; errorsOut: number; dropsIn: number; dropsOut: number } | null;
  dnsServers: string[];
  pingHost: string;
  pingResult: { host: string; reachable: boolean; latencyMs: number | null; raw: string } | null;
  pinging: boolean;
  activeTab: 'adapters' | 'connections' | 'stats';
}

class NetworkViewModel extends ViewModel<NetworkState> {
  constructor() {
    super({ loading: false, error: null, adapters: [], connections: [], stats: null, dnsServers: [], pingHost: '', pingResult: null, pinging: false, activeTab: 'adapters' });
  }

  async bootstrap() {
    this.setState({ loading: true, error: null });
    try {
      if (typeof window === 'undefined' || !window.avs) {
        throw new Error('AVS RPC bridge is unavailable');
      }
      const [adaptersResult, statsResult, dnsResult] = await Promise.all([
        window.avs.rpc.call('network.adapters') as Promise<{ adapters: NetworkAdapter[]; total: number }>,
        window.avs.rpc.call('network.statistics') as Promise<NetworkState['stats']>,
        window.avs.rpc.call('network.dns') as Promise<{ dnsServers: string[] }>,
      ]);
      this.setState({ loading: false, adapters: adaptersResult.adapters, stats: statsResult, dnsServers: dnsResult.dnsServers });
    } catch (e) {
      this.setState({ loading: false, error: e instanceof Error ? e.message : 'Failed to load network information' });
    }
  }

  async loadConnections() {
    try {
      if (typeof window === 'undefined' || !window.avs) return;
      const result = await window.avs.rpc.call('network.connections') as { connections: NetworkConnection[]; total: number };
      this.setState({ connections: result.connections });
    } catch (e) {
      this.setState({ error: e instanceof Error ? e.message : 'Failed to load connections' });
    }
  }

  setTab(tab: 'adapters' | 'connections' | 'stats') {
    this.setState({ activeTab: tab });
    if (tab === 'connections' && this.state.connections.length === 0) {
      this.loadConnections();
    }
  }

  setPingHost(host: string) {
    this.setState({ pingHost: host });
  }

  clearError() {
    this.setState({ error: null });
  }

  async ping() {
    if (!this.state.pingHost.trim()) return;
    this.setState({ pinging: true });
    try {
      if (typeof window === 'undefined' || !window.avs) {
        this.setState({ pinging: false });
        return;
      }
      const result = await window.avs.rpc.call('network.ping', { host: this.state.pingHost }) as NetworkState['pingResult'];
      this.setState({ pinging: false, pingResult: result });
    } catch (e) {
      this.setState({ pinging: false, error: e instanceof Error ? e.message : 'Ping failed' });
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function NetworkInformationPage() {
  const vm = useMemo(() => new NetworkViewModel(), []);
  const state = useViewModel(vm);

  useEffect(() => {
    vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  if (state.loading) {
    return (
      <div className="px-6 py-6">
        <PageHeader title="Network Information" description="Network adapters, connections, and diagnostics" />
        <ModuleLoadingState message="Loading network information…" />
      </div>
    );
  }

  if (state.error && state.adapters.length === 0) {
    const isBackendMissing = state.error.includes('failed to load') || state.error.includes('unavailable') || state.error.includes('avs.rpc');
    return (
      <div className="px-6 py-6">
        <PageHeader title="Network Information" description="Network adapters, connections, and diagnostics" />
        <Card variant="glass">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <WifiIcon className="h-12 w-12 text-text-muted mb-4" />
            <h3 className="text-small font-semibold text-text-primary mb-2">Network information unavailable</h3>
            <p className="text-small text-text-secondary max-w-md mb-4">
              {isBackendMissing
                ? 'The network diagnostics module could not be loaded. This feature requires the AVS Shield desktop application to be running with the backend service active.'
                : state.error}
            </p>
            <Button onClick={() => vm.bootstrap()} variant="secondary" leftIcon={<ArrowPathIcon className="h-4 w-4" />}>
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-6">
      <PageHeader
        title="Network Information"
        description="Network adapters, connections, and diagnostics"
        actions={
          <Button onClick={() => vm.bootstrap()} variant="secondary" leftIcon={<ArrowPathIcon className="h-4 w-4" />}>
            Refresh
          </Button>
        }
      />

      {state.error && state.adapters.length > 0 && (
        <ModuleErrorBanner
          message={state.error}
          onDismiss={() => vm.clearError()}
          testId="network-info-error-banner"
        />
      )}

      {/* Tab Bar */}
      <div className="flex items-center gap-1 border-b border-[var(--avs-glass-border)] pb-px">
        {([
          { id: 'adapters' as const, label: 'Adapters', icon: WifiIcon },
          { id: 'connections' as const, label: 'Connections', icon: CommandLineIcon },
          { id: 'stats' as const, label: 'Statistics', icon: ChartBarIcon },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => vm.setTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-small font-medium transition-colors ${
              state.activeTab === tab.id
                ? 'text-[var(--avs-brand-primary)] border-b-2 border-[var(--avs-brand-primary)]'
                : 'text-[var(--avs-text-muted)] hover:text-[var(--avs-text-primary)]'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Adapters Tab */}
      {state.activeTab === 'adapters' && (
        <div className="space-y-4">
          {state.adapters.map((adapter) => (
            <Card key={adapter.name} variant="glass">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <WifiIcon className={`h-5 w-5 ${adapter.isup ? 'text-[var(--avs-success)]' : 'text-[var(--avs-text-muted)]'}`} />
                  <div>
                    <p className="text-small font-medium text-[var(--avs-text-primary)]">{adapter.name}</p>
                    <p className="text-caption text-[var(--avs-text-muted)]">
                      {adapter.isup ? 'Connected' : 'Disconnected'}
                      {adapter.speedMbps ? ` · ${adapter.speedMbps} Mbps` : ''}
                      {` · MTU ${adapter.mtu}`}
                    </p>
                  </div>
                </div>
                <Badge tone={adapter.isup ? 'success' : 'neutral'}>{adapter.isup ? 'Up' : 'Down'}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-3">
                <div className="text-caption"><span className="text-[var(--avs-text-muted)]">IPv4:</span> <span className="text-[var(--avs-text-primary)]">{adapter.ipv4 || 'N/A'}</span></div>
                <div className="text-caption"><span className="text-[var(--avs-text-muted)]">IPv6:</span> <span className="text-[var(--avs-text-primary)]">{adapter.ipv6 || 'N/A'}</span></div>
                <div className="text-caption"><span className="text-[var(--avs-text-muted)]">MAC:</span> <span className="text-[var(--avs-text-primary)]">{adapter.mac || 'N/A'}</span></div>
                <div className="text-caption"><span className="text-[var(--avs-text-muted)]">Duplex:</span> <span className="text-[var(--avs-text-primary)]">{adapter.duplex}</span></div>
                <div className="text-caption"><span className="text-[var(--avs-text-muted)]">Sent:</span> <span className="text-[var(--avs-text-primary)]">{formatBytes(adapter.bytesSent)}</span></div>
                <div className="text-caption"><span className="text-[var(--avs-text-muted)]">Received:</span> <span className="text-[var(--avs-text-primary)]">{formatBytes(adapter.bytesRecv)}</span></div>
              </div>
            </Card>
          ))}

          {/* DNS Servers */}
          <Card title="DNS Servers" variant="glass">
            {state.dnsServers.length > 0 ? (
              <div className="space-y-1">
                {state.dnsServers.map((dns, i) => (
                  <div key={i} className="flex items-center gap-2 text-small text-[var(--avs-text-primary)]">
                    <GlobeAltIcon className="h-4 w-4 text-[var(--avs-brand-primary)]" />
                    {dns}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-caption text-[var(--avs-text-muted)]">No DNS servers detected</p>
            )}
          </Card>

          {/* Ping Utility */}
          <Card title="Ping Utility" variant="glass">
            <div className="flex items-center gap-2">
              <input
                value={state.pingHost}
                onChange={(e) => vm.setPingHost(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && vm.ping()}
                placeholder="Enter host (e.g. google.com)"
                className="flex-1 rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] px-3 py-2 text-small text-[var(--avs-text-primary)]"
              />
              <Button onClick={() => vm.ping()} loading={state.pinging} leftIcon={<CommandLineIcon className="h-4 w-4" />}>
                Ping
              </Button>
            </div>
            {state.pingResult && (
              <div className="mt-3 flex items-center gap-3">
                {state.pingResult.reachable ? (
                  <CheckCircleIcon className="h-5 w-5 text-[var(--avs-success)]" />
                ) : (
                  <ExclamationTriangleIcon className="h-5 w-5 text-[var(--avs-danger)]" />
                )}
                <span className="text-small text-[var(--avs-text-primary)]">
                  {state.pingResult.host}: {state.pingResult.reachable ? `Reachable (${state.pingResult.latencyMs}ms)` : 'Unreachable'}
                </span>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Connections Tab */}
      {state.activeTab === 'connections' && (
        <Card title={`Active Connections (${state.connections.length})`} variant="glass">
          {state.connections.length > 0 ? (
            <div className="space-y-1 max-h-[600px] overflow-y-auto">
              {state.connections.map((conn, i) => (
                <div key={i} className="flex items-center gap-3 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
                  <Badge tone={conn.type === 'TCP' ? 'brand' : 'neutral'}>{conn.type}</Badge>
                  <div className="flex-1 min-w-0">
                    <span className="text-caption text-[var(--avs-text-primary)]">{conn.localAddress || '—'} → {conn.remoteAddress || '—'}</span>
                    {conn.processName && (
                      <span className="text-caption text-[var(--avs-text-muted)] ml-2">({conn.processName})</span>
                    )}
                  </div>
                  <Badge tone={conn.status === 'ESTABLISHED' ? 'success' : 'neutral'}>{conn.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <ModuleEmptyState icon={CommandLineIcon} title="No active connections" message="Active network connections will appear here." />
          )}
        </Card>
      )}

      {/* Stats Tab */}
      {state.activeTab === 'stats' && state.stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatBox label="Bytes Sent" value={formatBytes(state.stats.bytesSent)} />
            <StatBox label="Bytes Received" value={formatBytes(state.stats.bytesRecv)} />
            <StatBox label="Packets Sent" value={state.stats.packetsSent.toLocaleString()} />
            <StatBox label="Packets Received" value={state.stats.packetsRecv.toLocaleString()} />
            <StatBox label="Errors In" value={state.stats.errorsIn.toString()} tone={state.stats.errorsIn > 0 ? 'warning' : 'neutral'} />
            <StatBox label="Errors Out" value={state.stats.errorsOut.toString()} tone={state.stats.errorsOut > 0 ? 'warning' : 'neutral'} />
            <StatBox label="Drops In" value={state.stats.dropsIn.toString()} tone={state.stats.dropsIn > 0 ? 'warning' : 'neutral'} />
            <StatBox label="Drops Out" value={state.stats.dropsOut.toString()} tone={state.stats.dropsOut > 0 ? 'warning' : 'neutral'} />
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'warning' }) {
  const colorClass = tone === 'warning' ? 'text-[var(--avs-warning)]' : 'text-[var(--avs-text-primary)]';
  return (
    <Card variant="glass">
      <p className={`text-section-title font-bold ${colorClass}`}>{value}</p>
      <p className="text-caption text-[var(--avs-text-muted)]">{label}</p>
    </Card>
  );
}

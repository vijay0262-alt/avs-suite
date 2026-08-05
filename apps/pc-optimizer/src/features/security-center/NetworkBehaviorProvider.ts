/**
 * NetworkBehaviorProvider — detects suspicious network behavior.
 *
 * Priority: ⭐⭐⭐⭐ (Behavior Analysis)
 *
 * Detects:
 *   - Unexpected outbound connections
 *   - Beacon-like behavior (regular intervals)
 *   - Unexpected listening ports
 *   - DNS anomalies
 *   - Connections to known suspicious ports
 *
 * False-positive control: Beacon detection requires 3+ connections
 * at regular intervals. Listening ports require unexpected flag.
 */
import { SecurityProvider } from './SecurityProvider';
import type {
  ProviderScanContext,
  ProviderScanResult,
  Threat,
  SecurityEvidence,
  NetworkBehaviorInput,
  NetworkConnectionDetail,
  ListeningPortDetail,
  DnsQueryDetail,
} from './types';
import { confidenceToLabel } from './types';

const SUSPICIOUS_PORTS = [4444, 1337, 31337, 6667, 6666, 9999, 12345, 54321];

export class NetworkBehaviorProvider extends SecurityProvider {
  constructor() {
    super('network-behavior', 'Network Behavior Provider', 'behavior', '1.0.0',
      'Detects suspicious network behavior: beacons, unexpected ports, DNS anomalies', 30);
    this.addCapability('beacon_detection');
    this.addCapability('listening_port_detection');
    this.addCapability('dns_anomaly_detection');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const input = context.options['networkBehavior'] as NetworkBehaviorInput | undefined;

      if (input) {
        // Analyze connections for beacon behavior
        const beaconThreats = this.analyzeBeacons(input.connections);
        threats.push(...beaconThreats);

        // Analyze listening ports
        for (const port of input.listeningPorts) {
          const t = this.analyzePort(port);
          if (t) threats.push(t);
        }

        // Analyze DNS queries
        for (const dns of input.dnsQueries) {
          const t = this.analyzeDns(dns);
          if (t) threats.push(t);
        }
      }

      const itemsScanned = (input?.connections.length ?? 0) + (input?.listeningPorts.length ?? 0) + (input?.dnsQueries.length ?? 0);
      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('active');
      return this.successResult(context, threats, duration, itemsScanned, { analyzed: itemsScanned });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }

  private analyzeBeacons(connections: NetworkConnectionDetail[]): Threat[] {
    const threats: Threat[] = [];
    const byProcess = new Map<string, NetworkConnectionDetail[]>();

    for (const conn of connections) {
      const key = `${conn.processName}:${conn.remoteAddress}`;
      if (!byProcess.has(key)) byProcess.set(key, []);
      byProcess.get(key)!.push(conn);
    }

    for (const [key, conns] of byProcess) {
      if (conns.length < 3) continue;

      const evidence: SecurityEvidence[] = [];
      const intervals: number[] = [];
      for (let i = 1; i < conns.length; i++) {
        intervals.push(conns[i]!.timestamp - conns[i - 1]!.timestamp);
      }

      // Check for regular intervals (beacon-like)
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((sum, v) => sum + Math.pow(v - avgInterval, 2), 0) / intervals.length;
      const stdDev = Math.sqrt(variance);
      const isRegular = avgInterval > 0 && stdDev / avgInterval < 0.3;

      if (isRegular || conns.some((c) => c.beaconLike)) {
        evidence.push({
          source: this.getId(),
          type: 'beacon_pattern',
          value: key,
          description: `Beacon-like behavior: ${conns.length} connections to ${conns[0]!.remoteAddress} at ~${Math.round(avgInterval / 1000)}s intervals`,
          timestamp: Date.now(),
        });

        if (SUSPICIOUS_PORTS.includes(conns[0]!.remotePort)) {
          evidence.push({
            source: this.getId(),
            type: 'suspicious_port',
            value: conns[0]!.remotePort.toString(),
            description: `Connection to suspicious port: ${conns[0]!.remotePort}`,
            timestamp: Date.now(),
          });
        }

        const [procName, remoteAddr] = key.split(':');
        const confidence = Math.min(0.9, 0.5 + conns.length * 0.05);
        const severity = conns.length >= 10 ? 'high' : 'medium';

        threats.push(this.createThreat({
          name: `Network beacon: ${procName} → ${remoteAddr}`,
          category: 'backdoor',
          severity,
          confidence,
          confidenceLabel: confidenceToLabel(confidence),
          risk: severity === 'high' ? 'high' : 'moderate',
          evidence,
          detectionSource: this.getId(),
          affectedAssets: [{ type: 'network', path: remoteAddr ?? '', name: procName ?? '', pid: conns[0]!.pid }],
          recommendation: 'Investigate this process and its network connections. The regular beacon pattern may indicate C2 communication.',
          explanation: `Process "${procName}" made ${conns.length} connections to ${remoteAddr} at regular intervals (~${Math.round(avgInterval / 1000)}s). This beacon-like pattern is consistent with command-and-control communication.`,
          mitreAttack: { tactic: 'Command and Control', technique: 'Application Layer Protocol', reference: 'https://attack.mitre.org/techniques/T1071' },
          canRemediate: false,
        }));
      }
    }

    return threats;
  }

  private analyzePort(port: ListeningPortDetail): Threat | null {
    if (!port.unexpected) return null;

    const evidence: SecurityEvidence[] = [{
      source: this.getId(),
      type: 'unexpected_listening',
      value: port.port.toString(),
      description: `Process "${port.processName}" listening on unexpected port ${port.port}`,
      timestamp: Date.now(),
    }];

    if (SUSPICIOUS_PORTS.includes(port.port)) {
      evidence.push({
        source: this.getId(),
        type: 'suspicious_port',
        value: port.port.toString(),
        description: `Port ${port.port} is commonly associated with malware`,
        timestamp: Date.now(),
      });
    }

    const severity = SUSPICIOUS_PORTS.includes(port.port) ? 'high' : 'medium';
    const confidence = SUSPICIOUS_PORTS.includes(port.port) ? 0.8 : 0.6;

    return this.createThreat({
      name: `Unexpected listening port: ${port.processName}:${port.port}`,
      category: 'backdoor',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk: severity === 'high' ? 'high' : 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'network', path: `${port.address}:${port.port}`, name: port.processName, pid: port.pid }],
      recommendation: 'Investigate this process. Unexpected listening ports may indicate a backdoor or unauthorized service.',
      explanation: `Process "${port.processName}" (PID ${port.pid}) is listening on port ${port.port} at ${port.address}. ${evidence.map((e) => e.description).join('; ')}.`,
      mitreAttack: { tactic: 'Command and Control', technique: 'Non-Standard Port', reference: 'https://attack.mitre.org/techniques/T1571' },
      canRemediate: false,
    });
  }

  private analyzeDns(dns: DnsQueryDetail): Threat | null {
    if (!dns.suspicious) return null;
    if (dns.reasons.length < 1) return null;

    const evidence: SecurityEvidence[] = dns.reasons.map((reason) => ({
      source: this.getId(),
      type: 'dns_anomaly',
      value: dns.domain,
      description: reason,
      timestamp: dns.timestamp,
    }));

    const severity = dns.reasons.length >= 3 ? 'medium' : 'low';
    const confidence = Math.min(0.85, 0.4 + dns.reasons.length * 0.12);

    return this.createThreat({
      name: `DNS anomaly: ${dns.domain}`,
      category: 'unknown',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk: 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'network', path: dns.domain, name: dns.processName }],
      recommendation: 'Investigate this DNS query. Check if the domain is legitimate.',
      explanation: `Process "${dns.processName}" queried suspicious domain "${dns.domain}". Reasons: ${dns.reasons.join(', ')}.`,
      mitreAttack: { tactic: 'Command and Control', technique: 'DNS', reference: 'https://attack.mitre.org/techniques/T1071/004' },
      canRemediate: false,
    });
  }
}

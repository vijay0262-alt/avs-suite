/**
 * CryptoMinerDetectionProvider — detects cryptocurrency mining activity.
 *
 * Priority: ⭐⭐⭐⭐⭐ (PUP/Adware Detection)
 *
 * Detects:
 *   - High CPU + GPU usage patterns
 *   - Mining pool connections
 *   - Known mining process names
 *   - Stratum protocol connections
 *   - Mining-related command line arguments
 *   - GPU monitoring API access
 *
 * False-positive control: Requires 2+ indicators. High CPU alone
 * is not sufficient — must have additional mining indicators.
 */
import { SecurityProvider } from './SecurityProvider';
import type {
  ProviderScanContext,
  ProviderScanResult,
  Threat,
  SecurityEvidence,
  CryptoMinerInput,
  CryptoMinerProcessDetail,
} from './types';
import { confidenceToLabel } from './types';

const KNOWN_MINER_NAMES = ['xmrig', 'ccminer', 'ethminer', 'claymore', 'phoenixminer', 'nbminer', 'trex', 'lolminer', 'gminer', 'teamredminer', 'cryptonight', 'stratum'];
const MINING_POOL_INDICATORS = ['stratum+tcp', 'stratum+ssl', 'pool.minexmr', 'xmr-pool', 'nanopool', 'ethermine', 'f2pool', 'antpool', 'miningpoolhub'];

export class CryptoMinerDetectionProvider extends SecurityProvider {
  constructor() {
    super('crypto-miner-detection', 'Crypto Miner Detection Provider', 'behavior', '1.0.0',
      'Detects cryptocurrency mining: high CPU/GPU, pool connections, known miners', 43);
    this.addCapability('miner_process_detection');
    this.addCapability('mining_pool_detection');
    this.addCapability('gpu_abuse_detection');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const input = context.options['cryptoMinerInput'] as CryptoMinerInput | undefined;
      const processes = input?.processes ?? [];

      for (const proc of processes) {
        const t = this.analyzeProcess(proc);
        if (t) threats.push(t);
      }

      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('active');
      return this.successResult(context, threats, duration, processes.length, { analyzed: processes.length });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }

  private analyzeProcess(proc: CryptoMinerProcessDetail): Threat | null {
    const evidence: SecurityEvidence[] = [];
    let indicatorCount = 0;

    // High CPU usage
    if (proc.cpuUsage > 70) {
      evidence.push({ source: this.getId(), type: 'high_cpu', value: proc.cpuUsage.toString(), description: `High CPU usage: ${proc.cpuUsage}%`, timestamp: proc.timestamp });
      indicatorCount++;
    }

    // High GPU usage
    if (proc.gpuUsage > 50) {
      evidence.push({ source: this.getId(), type: 'high_gpu', value: proc.gpuUsage.toString(), description: `High GPU usage: ${proc.gpuUsage}%`, timestamp: proc.timestamp });
      indicatorCount++;
    }

    // Known miner name
    const nameLower = proc.processName.toLowerCase();
    const matchedMiner = KNOWN_MINER_NAMES.find((n) => nameLower.includes(n));
    if (matchedMiner) {
      evidence.push({ source: this.getId(), type: 'known_miner_name', value: matchedMiner, description: `Process name matches known miner: ${matchedMiner}`, timestamp: proc.timestamp });
      indicatorCount++;
    }

    // Pool connections
    for (const conn of proc.poolConnections) {
      const matchedPool = MINING_POOL_INDICATORS.find((p) => conn.toLowerCase().includes(p));
      if (matchedPool) {
        evidence.push({ source: this.getId(), type: 'pool_connection', value: conn, description: `Mining pool connection detected: ${conn}`, timestamp: proc.timestamp });
        indicatorCount++;
        break;
      }
    }

    // Mining indicators
    for (const ind of proc.miningIndicators) {
      evidence.push({ source: this.getId(), type: 'mining_indicator', value: ind, description: `Mining indicator: ${ind}`, timestamp: proc.timestamp });
      indicatorCount++;
    }

    // False-positive control: require 2+ indicators
    if (indicatorCount < 2) return null;

    const hasPoolConnection = evidence.some((e) => e.type === 'pool_connection');
    const hasKnownMiner = evidence.some((e) => e.type === 'known_miner_name');
    const severity = (hasPoolConnection && hasKnownMiner) ? 'high' : hasPoolConnection || hasKnownMiner ? 'medium' : 'low';
    const confidence = Math.min(0.9, 0.4 + indicatorCount * 0.12);

    return this.createThreat({
      name: `Crypto miner detected: ${proc.processName}`,
      category: 'crypto_miner',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk: severity === 'high' ? 'high' : 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'process', path: proc.path, name: proc.processName, pid: proc.pid }],
      recommendation: 'Terminate this process if unauthorized. Check for persistence mechanisms. Monitor GPU/CPU usage.',
      explanation: `Process "${proc.processName}" (PID ${proc.pid}) shows ${indicatorCount} mining indicator(s): CPU ${proc.cpuUsage}%, GPU ${proc.gpuUsage}%. ${evidence.map((e) => e.description).join('; ')}.`,
      mitreAttack: { tactic: 'Resource Development', technique: 'Compromise Infrastructure: Cryptocurrency Mining', reference: 'https://attack.mitre.org/techniques/T1583/004' },
      canRemediate: false,
    });
  }
}

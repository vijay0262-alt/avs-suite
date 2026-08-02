/**
 * ThreatTimelineBuilder — builds chronological event history.
 *
 * Creates a timeline from threat evidence and detection events,
 * including discovery, execution, persistence, network, privilege
 * changes, user actions, and system changes.
 */
import type { Threat, TimelineEvent, TimelineEventType } from './types';

const EVIDENCE_TYPE_TO_TIMELINE: Record<string, TimelineEventType> = {
  // Execution
  encoded_command: 'execution',
  encoded_script: 'execution',
  download_cradle: 'execution',
  shell_call: 'execution',
  wsh_shell: 'execution',
  shell_app: 'execution',
  lolbin: 'execution',
  suspicious_command: 'execution',
  invoke_expression: 'execution',

  // Persistence
  unsigned: 'persistence',
  unknown_publisher: 'persistence',
  suspicious_location: 'persistence',
  hidden: 'persistence',
  hidden_task: 'persistence',
  no_author: 'persistence',
  logon_trigger: 'persistence',
  runonce_key: 'persistence',
  auto_start: 'persistence',
  wmi_filter: 'persistence',
  wmi_consumer: 'persistence',
  wmi_command: 'persistence',
  temp_location: 'persistence',
  temp_execution: 'persistence',
  suspicious_path: 'persistence',
  system_unsigned: 'persistence',
  privileged_unsigned: 'persistence',

  // Network
  beacon_pattern: 'network',
  suspicious_port: 'network',
  unexpected_listening: 'network',
  dns_anomaly: 'network',
  pool_connection: 'network',

  // Privilege
  high_cpu: 'privilege_change',
  high_gpu: 'privilege_change',

  // System changes
  homepage_modification: 'system_change',
  search_engine_replacement: 'system_change',
  proxy_setting: 'system_change',
  certificate_anomaly: 'system_change',
  notification_abuse: 'system_change',
  reg_add: 'system_change',
  reg_delete: 'system_change',
  service_create: 'system_change',
  service_config: 'system_change',
  net_user: 'system_change',
  net_localgroup: 'system_change',

  // Ransomware indicators
  shadow_copy_deletion: 'system_change',
  recovery_disable: 'system_change',
  backup_deletion: 'system_change',
  mass_encryption: 'system_change',
  ransom_note_creation: 'system_change',
  known_ransomware_name: 'detection',
  disk_encryption_command: 'execution',

  // Trojan indicators
  dll_injection: 'detection',
  system_process_impersonation: 'detection',
  dropper_behavior: 'execution',
  known_trojan_name: 'detection',
  suspicious_network_connection: 'network',

  // Keylogger indicators
  keyboard_hook: 'detection',
  keylogger_process_name: 'detection',
  log_file_creation: 'system_change',
  clipboard_monitoring: 'detection',
  known_keylogger_name: 'detection',
  input_capture_api: 'detection',

  // Rootkit indicators
  ssdt_hook: 'privilege_change',
  irp_hook: 'privilege_change',
  hidden_process: 'persistence',
  dkom_indicator: 'privilege_change',
  suspicious_driver_load: 'persistence',
  known_rootkit_name: 'detection',
  hidden_service: 'persistence',

  // Detection
  known_bad: 'detection',
  known_miner_name: 'detection',
  low_reputation: 'detection',
  recently_seen: 'detection',
  low_rating: 'detection',
  all_urls_access: 'detection',
  suspicious_permissions: 'detection',
  process_injection: 'detection',
  create_remote_thread: 'detection',
  write_process_memory: 'detection',
  virtual_allocex: 'detection',
  process_hollowing: 'detection',
};

export class ThreatTimelineBuilder {
  build(threats: Threat[]): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    for (const threat of threats) {
      // Add detection event
      events.push({
        id: `tl-${threat.id}-detection`,
        timestamp: threat.detectionTime,
        type: 'detection',
        description: `Threat detected: ${threat.name}`,
        source: threat.detectionSource,
        threatId: threat.id,
        severity: threat.severity,
        evidenceRef: null,
      });

      // Add evidence-based events
      for (const evidence of threat.evidence) {
        const timelineType = this.mapEvidenceType(evidence.type);
        if (timelineType) {
          events.push({
            id: `tl-${threat.id}-${evidence.type}-${evidence.timestamp}`,
            timestamp: evidence.timestamp,
            type: timelineType,
            description: evidence.description,
            source: evidence.source,
            threatId: threat.id,
            severity: threat.severity,
            evidenceRef: evidence.type,
          });
        }
      }
    }

    // Sort chronologically (earliest first)
    events.sort((a, b) => a.timestamp - b.timestamp);

    return events;
  }

  private mapEvidenceType(evidenceType: string): TimelineEventType | null {
    // Direct mapping
    if (EVIDENCE_TYPE_TO_TIMELINE[evidenceType]) {
      return EVIDENCE_TYPE_TO_TIMELINE[evidenceType]!;
    }

    // Pattern-based mapping
    if (evidenceType.includes('download') || evidenceType.includes('cradle')) return 'execution';
    if (evidenceType.includes('persist') || evidenceType.includes('startup') || evidenceType.includes('run')) return 'persistence';
    if (evidenceType.includes('network') || evidenceType.includes('beacon') || evidenceType.includes('port')) return 'network';
    if (evidenceType.includes('privilege') || evidenceType.includes('system')) return 'privilege_change';
    if (evidenceType.includes('modif') || evidenceType.includes('change') || evidenceType.includes('replace')) return 'system_change';
    if (evidenceType.includes('detect') || evidenceType.includes('known') || evidenceType.includes('reputation')) return 'detection';

    return null;
  }
}

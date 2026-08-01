/**
 * ThreatRecommendationEngine — generates actionable recommendations.
 *
 * For every investigation, produces prioritized recommended actions
 * with reasons, difficulty levels, and categories.
 *
 * No remediation — recommendations are advisory only.
 */
import type { Threat, RecommendedAction, ThreatCategory } from './types';
import type { ThreatKnowledgeBase } from './ThreatKnowledgeBase';

const CATEGORY_RECOMMENDATIONS: Record<ThreatCategory, Omit<RecommendedAction, 'id'>[]> = {
  spyware: [
    { priority: 'immediate', action: 'Investigate the detected process and its network connections', reason: 'Spyware may be actively transmitting stolen data', userActionRequired: true, estimatedDifficulty: 'advanced', category: 'review' },
    { priority: 'high', action: 'Check for unauthorized data access and change compromised passwords', reason: 'Spyware may have captured credentials', userActionRequired: true, estimatedDifficulty: 'moderate', category: 'verify' },
    { priority: 'medium', action: 'Scan the system with a full security scan', reason: 'Spyware may be part of a larger infection', userActionRequired: false, estimatedDifficulty: 'easy', category: 'monitor' },
  ],
  adware: [
    { priority: 'high', action: 'Remove the detected adware program', reason: 'Adware degrades browsing experience and may collect data', userActionRequired: true, estimatedDifficulty: 'easy', category: 'remove' },
    { priority: 'medium', action: 'Restore browser settings to defaults', reason: 'Browser settings may have been modified by adware', userActionRequired: true, estimatedDifficulty: 'easy', category: 'restore' },
    { priority: 'low', action: 'Review notification permissions in browser settings', reason: 'Adware may have abused notification permissions', userActionRequired: true, estimatedDifficulty: 'easy', category: 'review' },
  ],
  pup: [
    { priority: 'medium', action: 'Uninstall the potentially unwanted program if you did not intentionally install it', reason: 'PUPs may slow down your system and display misleading warnings', userActionRequired: true, estimatedDifficulty: 'easy', category: 'remove' },
    { priority: 'low', action: 'Be cautious of bundled offers during future software installations', reason: 'PUPs typically install via bundled offers', userActionRequired: false, estimatedDifficulty: 'easy', category: 'review' },
  ],
  browser_hijacker: [
    { priority: 'high', action: 'Review and remove unauthorized browser extensions', reason: 'Browser hijackers often install as extensions', userActionRequired: true, estimatedDifficulty: 'easy', category: 'remove' },
    { priority: 'high', action: 'Restore browser homepage, search engine, and new tab settings', reason: 'Browser settings were modified without consent', userActionRequired: true, estimatedDifficulty: 'easy', category: 'restore' },
    { priority: 'medium', action: 'Check and revoke suspicious notification permissions', reason: 'Hijackers may abuse notifications for ads', userActionRequired: true, estimatedDifficulty: 'easy', category: 'review' },
    { priority: 'medium', action: 'Check proxy settings and restore if modified', reason: 'Hijackers may redirect traffic through a proxy', userActionRequired: true, estimatedDifficulty: 'moderate', category: 'restore' },
  ],
  crypto_miner: [
    { priority: 'high', action: 'Terminate the mining process if unauthorized', reason: 'Crypto miners steal computing resources and electricity', userActionRequired: true, estimatedDifficulty: 'moderate', category: 'remove' },
    { priority: 'high', action: 'Check for persistence mechanisms (startup entries, scheduled tasks)', reason: 'Miners often persist across reboots', userActionRequired: true, estimatedDifficulty: 'advanced', category: 'review' },
    { priority: 'medium', action: 'Monitor CPU and GPU usage after removal', reason: 'Miners may reinstall or use hidden processes', userActionRequired: false, estimatedDifficulty: 'easy', category: 'monitor' },
  ],
  malware: [
    { priority: 'immediate', action: 'Investigate the detected process, its parent, and network connections', reason: 'Malware may be actively performing malicious actions', userActionRequired: true, estimatedDifficulty: 'advanced', category: 'review' },
    { priority: 'immediate', action: 'Run a full system security scan', reason: 'Malware may have installed additional components', userActionRequired: false, estimatedDifficulty: 'easy', category: 'monitor' },
    { priority: 'high', action: 'Check for unauthorized network connections and block if necessary', reason: 'Malware may communicate with command-and-control servers', userActionRequired: true, estimatedDifficulty: 'moderate', category: 'isolate' },
  ],
  trojans: [
    { priority: 'immediate', action: 'Identify and remove the trojan program', reason: 'Trojans can steal data and provide remote access', userActionRequired: true, estimatedDifficulty: 'moderate', category: 'remove' },
    { priority: 'high', action: 'Scan for additional malware that the trojan may have downloaded', reason: 'Trojans often deliver additional payloads', userActionRequired: false, estimatedDifficulty: 'easy', category: 'monitor' },
  ],
  ransomware: [
    { priority: 'immediate', action: 'Disconnect from network immediately', reason: 'Ransomware may spread to other systems or encrypt network shares', userActionRequired: true, estimatedDifficulty: 'easy', category: 'isolate' },
    { priority: 'immediate', action: 'Do not pay the ransom — contact security professionals', reason: 'Paying does not guarantee file recovery and funds criminal activity', userActionRequired: true, estimatedDifficulty: 'moderate', category: 'report' },
    { priority: 'high', action: 'Check backup availability for affected files', reason: 'Backups are the most reliable recovery method', userActionRequired: true, estimatedDifficulty: 'moderate', category: 'restore' },
  ],
  keylogger: [
    { priority: 'immediate', action: 'Change all passwords from a different, clean device', reason: 'Keylogger may have captured all typed credentials', userActionRequired: true, estimatedDifficulty: 'moderate', category: 'verify' },
    { priority: 'high', action: 'Identify and remove the keylogging software', reason: 'Keylogger continues capturing data until removed', userActionRequired: true, estimatedDifficulty: 'advanced', category: 'remove' },
  ],
  rootkit: [
    { priority: 'immediate', action: 'Consider a clean OS reinstallation from trusted media', reason: 'Rootkits operate at kernel level and are extremely difficult to remove reliably', userActionRequired: true, estimatedDifficulty: 'advanced', category: 'remove' },
    { priority: 'high', action: 'Backup important files (scan them before restoring)', reason: 'You may need to wipe the system — preserve data first', userActionRequired: true, estimatedDifficulty: 'moderate', category: 'restore' },
  ],
  bootkit: [
    { priority: 'immediate', action: 'Reinstall the operating system from clean, trusted media', reason: 'Bootkits survive OS reinstalls — use Secure Boot and clean installation media', userActionRequired: true, estimatedDifficulty: 'advanced', category: 'remove' },
    { priority: 'high', action: 'Enable Secure Boot and UEFI firmware', reason: 'Secure Boot prevents bootkit infection', userActionRequired: true, estimatedDifficulty: 'advanced', category: 'verify' },
  ],
  backdoor: [
    { priority: 'immediate', action: 'Identify and close the backdoor connection', reason: 'Backdoor provides remote access to your system', userActionRequired: true, estimatedDifficulty: 'advanced', category: 'isolate' },
    { priority: 'high', action: 'Check firewall logs for unauthorized connections', reason: 'Backdoor may have established multiple connections', userActionRequired: true, estimatedDifficulty: 'moderate', category: 'review' },
    { priority: 'high', action: 'Scan for additional malware installed via the backdoor', reason: 'Backdoors are often used to deliver additional payloads', userActionRequired: false, estimatedDifficulty: 'easy', category: 'monitor' },
  ],
  dropper: [
    { priority: 'immediate', action: 'Identify and remove the dropper', reason: 'Dropper may download additional malware at any time', userActionRequired: true, estimatedDifficulty: 'moderate', category: 'remove' },
    { priority: 'high', action: 'Scan for malware that the dropper may have already installed', reason: 'Dropper may have delivered payloads before detection', userActionRequired: false, estimatedDifficulty: 'easy', category: 'monitor' },
  ],
  downloader: [
    { priority: 'immediate', action: 'Remove the downloader component', reason: 'Downloader fetches additional malware', userActionRequired: true, estimatedDifficulty: 'moderate', category: 'remove' },
    { priority: 'high', action: 'Monitor network connections for additional downloads', reason: 'Downloader may have already fetched payloads', userActionRequired: false, estimatedDifficulty: 'easy', category: 'monitor' },
  ],
  unsafe_script: [
    { priority: 'high', action: 'Do not execute the detected script', reason: 'The script exhibits malicious behavior patterns', userActionRequired: true, estimatedDifficulty: 'easy', category: 'review' },
    { priority: 'high', action: 'Investigate the script source and verify intent', reason: 'Malicious scripts often arrive via email or downloads', userActionRequired: true, estimatedDifficulty: 'moderate', category: 'verify' },
    { priority: 'medium', action: 'Review PowerShell execution policies', reason: 'Restricting execution policies prevents unauthorized scripts', userActionRequired: true, estimatedDifficulty: 'moderate', category: 'review' },
  ],
  suspicious_scheduled_task: [
    { priority: 'high', action: 'Review the scheduled task and disable if unrecognized', reason: 'Suspicious tasks may execute malware at regular intervals', userActionRequired: true, estimatedDifficulty: 'moderate', category: 'review' },
    { priority: 'medium', action: 'Check the task command for encoded or obfuscated content', reason: 'Encoded commands are a strong indicator of malicious activity', userActionRequired: true, estimatedDifficulty: 'advanced', category: 'verify' },
  ],
  suspicious_service: [
    { priority: 'high', action: 'Review the service and disable if unrecognized', reason: 'Suspicious services may run with system privileges', userActionRequired: true, estimatedDifficulty: 'moderate', category: 'review' },
    { priority: 'medium', action: 'Verify the service binary path and publisher', reason: 'Services from temp directories or unknown publishers are high-risk', userActionRequired: true, estimatedDifficulty: 'advanced', category: 'verify' },
  ],
  suspicious_startup_entry: [
    { priority: 'high', action: 'Review the startup entry and remove if unrecognized', reason: 'Suspicious startup entries execute at every logon', userActionRequired: true, estimatedDifficulty: 'moderate', category: 'review' },
    { priority: 'medium', action: 'Check the startup command for suspicious patterns', reason: 'Encoded PowerShell or rundll32 calls indicate malicious activity', userActionRequired: true, estimatedDifficulty: 'advanced', category: 'verify' },
  ],
  pua: [
    { priority: 'medium', action: 'Review the application and uninstall if unwanted', reason: 'PUAs may degrade system performance and collect data', userActionRequired: true, estimatedDifficulty: 'easy', category: 'remove' },
    { priority: 'low', action: 'Use custom installation options for future software installs', reason: 'PUAs typically install via bundled offers', userActionRequired: false, estimatedDifficulty: 'easy', category: 'review' },
  ],
  unknown: [
    { priority: 'high', action: 'Investigate the detected behavior carefully', reason: 'Unknown threats require manual analysis to determine if they are malicious', userActionRequired: true, estimatedDifficulty: 'advanced', category: 'review' },
    { priority: 'medium', action: 'Monitor the system for additional indicators', reason: 'Additional indicators may clarify the nature of the threat', userActionRequired: false, estimatedDifficulty: 'easy', category: 'monitor' },
  ],
};

export class ThreatRecommendationEngine {
  constructor(private knowledgeBase: ThreatKnowledgeBase) {}

  generate(threats: Threat[]): RecommendedAction[] {
    const actions: RecommendedAction[] = [];
    const seenCategories = new Set<ThreatCategory>();

    // Sort threats by severity (highest first) to prioritize recommendations
    const sorted = [...threats].sort((a, b) => {
      const order = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
      return order[b.severity] - order[a.severity];
    });

    for (const threat of sorted) {
      const category = threat.category;
      if (seenCategories.has(category)) continue;
      seenCategories.add(category);

      const recs = CATEGORY_RECOMMENDATIONS[category] ?? CATEGORY_RECOMMENDATIONS['unknown'];
      for (const rec of recs) {
        actions.push({
          ...rec,
          id: `rec-${threat.id}-${actions.length}`,
        });
      }
    }

    // Add prevention tips from knowledge base
    const primaryCategory = sorted[0]?.category ?? 'unknown';
    const preventionTips = this.knowledgeBase.getPreventionTips(primaryCategory);
    if (preventionTips.length > 0) {
      actions.push({
        id: `rec-prevention-${actions.length}`,
        priority: 'low',
        action: `Prevention: ${preventionTips[0]}`,
        reason: 'Following prevention tips reduces risk of future infections',
        userActionRequired: false,
        estimatedDifficulty: 'easy',
        category: 'review',
      });
    }

    return actions;
  }

  getEstimatedImpact(threats: Threat[]): string {
    const hasCritical = threats.some((t) => t.severity === 'critical');
    const hasHigh = threats.some((t) => t.severity === 'high');
    const hasBackdoor = threats.some((t) => t.category === 'backdoor' || t.category === 'spyware' || t.category === 'keylogger');
    const hasRansomware = threats.some((t) => t.category === 'ransomware');

    if (hasRansomware) return 'Critical — potential permanent data loss and system lockdown. Immediate action required.';
    if (hasCritical) return 'Critical — system security is severely compromised. Data theft or system damage may be occurring.';
    if (hasHigh && hasBackdoor) return 'High — active data theft or remote access may be occurring. Credentials and sensitive data are at risk.';
    if (hasHigh) return 'High — significant security risk. Malicious activity may be in progress.';
    if (threats.some((t) => t.severity === 'medium')) return 'Moderate — system security is degraded. Prompt review recommended.';
    return 'Low — minimal immediate risk, but monitoring and review are advised.';
  }

  getEstimatedRecovery(threats: Threat[]): string {
    const hasRootkit = threats.some((t) => t.category === 'rootkit' || t.category === 'bootkit');
    const hasRansomware = threats.some((t) => t.category === 'ransomware');
    const hasBackdoor = threats.some((t) => t.category === 'backdoor');
    const hasPersistence = threats.some((t) => t.category === 'suspicious_scheduled_task' || t.category === 'suspicious_service' || t.category === 'suspicious_startup_entry');

    if (hasRootkit) return 'Difficult — may require clean OS reinstallation from trusted media. Estimated: 2-4 hours with backups.';
    if (hasRansomware) return 'Very difficult — depends on backup availability. Without backups, recovery may be impossible. Estimated: 4-8 hours with backups.';
    if (hasBackdoor) return 'Moderate — remove backdoor, check for additional malware, change all passwords. Estimated: 1-3 hours.';
    if (hasPersistence) return 'Moderate — remove persistence mechanism and associated malware. Estimated: 30-90 minutes.';
    return 'Easy to moderate — review and remove detected threats. Estimated: 15-60 minutes.';
  }
}

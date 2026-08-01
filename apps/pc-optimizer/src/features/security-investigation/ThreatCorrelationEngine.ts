/**
 * ThreatCorrelationEngine — links related detections into groups.
 *
 * Example correlation chain:
 *   Suspicious PowerShell → Creates Scheduled Task → Downloads Executable
 *   → Creates Startup Entry → Contacts Remote Host → One Investigation
 *
 * Correlation signals:
 *   - Shared file paths or process names
 *   - Temporal proximity (within time window)
 *   - Asset overlap (same files, registry keys, ports)
 *   - MITRE ATT&CK tactic chaining (execution → persistence → C2)
 *   - Evidence type complementarity
 */
import type { Threat, ThreatRelationship } from './types';

export interface CorrelationGroup {
  primaryThreatId: string;
  threatIds: string[];
  relationships: ThreatRelationship[];
}

const TACTIC_CHAIN: Record<string, string[]> = {
  'Execution': ['Persistence', 'Command and Control', 'Credential Access'],
  'Persistence': ['Execution', 'Command and Control', 'Privilege Escalation'],
  'Credential Access': ['Collection', 'Exfiltration'],
  'Collection': ['Exfiltration', 'Command and Control'],
  'Command and Control': ['Exfiltration', 'Persistence'],
  'Defense Evasion': ['Execution', 'Persistence'],
  'Resource Development': ['Command and Control'],
};

export class ThreatCorrelationEngine {
  correlate(threats: Threat[], timeWindow: number): CorrelationGroup[] {
    if (threats.length <= 1) {
      return threats.map((t) => ({
        primaryThreatId: t.id,
        threatIds: [t.id],
        relationships: [],
      }));
    }

    const relationships = this.findRelationships(threats, timeWindow);
    const groups = this.buildGroups(threats, relationships);

    return groups;
  }

  private findRelationships(threats: Threat[], timeWindow: number): ThreatRelationship[] {
    const relationships: ThreatRelationship[] = [];

    for (let i = 0; i < threats.length; i++) {
      for (let j = i + 1; j < threats.length; j++) {
        const a = threats[i]!;
        const b = threats[j]!;

        // Check temporal proximity
        const timeDiff = Math.abs(a.detectionTime - b.detectionTime);
        if (timeDiff > timeWindow) continue;

        // Check for relationships
        const rel = this.analyzePair(a, b);
        if (rel) relationships.push(rel);
      }
    }

    return relationships;
  }

  private analyzePair(a: Threat, b: Threat): ThreatRelationship | null {
    // Check asset overlap
    const sharedAssets = this.findSharedAssets(a, b);
    if (sharedAssets.length > 0) {
      return {
        fromThreatId: a.id,
        toThreatId: b.id,
        type: 'related_to',
        description: `Threats share affected assets: ${sharedAssets.join(', ')}`,
        strength: 0.7,
      };
    }

    // Check MITRE tactic chaining
    if (a.mitreAttack && b.mitreAttack) {
      const chainedTactics = TACTIC_CHAIN[a.mitreAttack.tactic];
      if (chainedTactics?.includes(b.mitreAttack.tactic)) {
        return {
          fromThreatId: a.id,
          toThreatId: b.id,
          type: 'enables',
          description: `${a.mitreAttack.tactic} enables ${b.mitreAttack.tactic} — tactic chaining detected`,
          strength: 0.8,
        };
      }
    }

    // Check process/path overlap in evidence
    const aPaths = this.extractPaths(a);
    const bPaths = this.extractPaths(b);
    const sharedPaths = aPaths.filter((p) => bPaths.includes(p));
    if (sharedPaths.length > 0) {
      return {
        fromThreatId: a.id,
        toThreatId: b.id,
        type: 'related_to',
        description: `Threats reference common paths: ${sharedPaths.slice(0, 3).join(', ')}`,
        strength: 0.6,
      };
    }

    // Check category-based relationships
    const catRel = this.analyzeCategories(a, b);
    if (catRel) return catRel;

    return null;
  }

  private findSharedAssets(a: Threat, b: Threat): string[] {
    const aAssets = new Set(a.affectedAssets.map((asset) => `${asset.type}:${asset.path}`));
    const bAssets = new Set(b.affectedAssets.map((asset) => `${asset.type}:${asset.path}`));
    const shared: string[] = [];
    for (const key of aAssets) {
      if (bAssets.has(key)) shared.push(key);
    }
    return shared;
  }

  private extractPaths(threat: Threat): string[] {
    const paths: string[] = [];
    for (const evidence of threat.evidence) {
      if (evidence.value.includes('\\') || evidence.value.includes('/')) {
        paths.push(evidence.value.toLowerCase());
      }
    }
    for (const asset of threat.affectedAssets) {
      paths.push(asset.path.toLowerCase());
    }
    return [...new Set(paths)];
  }

  private analyzeCategories(a: Threat, b: Threat): ThreatRelationship | null {
    // PowerShell → creates task/service/startup
    if (a.category === 'unsafe_script' && b.category === 'suspicious_scheduled_task') {
      return { fromThreatId: a.id, toThreatId: b.id, type: 'creates', description: 'Script analysis suggests creation of scheduled task', strength: 0.75 };
    }
    if (a.category === 'unsafe_script' && b.category === 'suspicious_startup_entry') {
      return { fromThreatId: a.id, toThreatId: b.id, type: 'creates', description: 'Script analysis suggests creation of startup entry', strength: 0.75 };
    }
    if (a.category === 'unsafe_script' && b.category === 'suspicious_service') {
      return { fromThreatId: a.id, toThreatId: b.id, type: 'creates', description: 'Script analysis suggests service creation', strength: 0.75 };
    }

    // Dropper/downloader → downloads malware
    if ((a.category === 'dropper' || a.category === 'downloader') && b.category === 'malware') {
      return { fromThreatId: a.id, toThreatId: b.id, type: 'downloads', description: 'Dropper/downloader delivered malware payload', strength: 0.85 };
    }

    // Persistence → enables backdoor
    if (a.category === 'suspicious_startup_entry' && b.category === 'backdoor') {
      return { fromThreatId: a.id, toThreatId: b.id, type: 'persists_via', description: 'Backdoor uses startup entry for persistence', strength: 0.8 };
    }
    if (a.category === 'suspicious_scheduled_task' && b.category === 'backdoor') {
      return { fromThreatId: a.id, toThreatId: b.id, type: 'persists_via', description: 'Backdoor uses scheduled task for persistence', strength: 0.8 };
    }

    // Spyware → credential access
    if (a.category === 'spyware' && b.category === 'keylogger') {
      return { fromThreatId: a.id, toThreatId: b.id, type: 'related_to', description: 'Spyware and keylogger detected together — likely same campaign', strength: 0.7 };
    }

    // Browser hijacker → adware
    if (a.category === 'browser_hijacker' && b.category === 'adware') {
      return { fromThreatId: a.id, toThreatId: b.id, type: 'related_to', description: 'Browser hijacker and adware detected together — common bundling pattern', strength: 0.65 };
    }

    return null;
  }

  private buildGroups(threats: Threat[], relationships: ThreatRelationship[]): CorrelationGroup[] {
    // Union-Find to group connected threats
    const parent = new Map<string, string>();
    for (const t of threats) parent.set(t.id, t.id);

    const find = (id: string): string => {
      let root = id;
      while (parent.get(root) !== root) root = parent.get(root)!;
      // Path compression
      let current = id;
      while (parent.get(current) !== root) {
        const next = parent.get(current)!;
        parent.set(current, root);
        current = next;
      }
      return root;
    };

    const union = (a: string, b: string): void => {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) parent.set(rootA, rootB);
    };

    for (const rel of relationships) {
      union(rel.fromThreatId, rel.toThreatId);
    }

    // Group by root
    const groupsMap = new Map<string, string[]>();
    for (const t of threats) {
      const root = find(t.id);
      if (!groupsMap.has(root)) groupsMap.set(root, []);
      groupsMap.get(root)!.push(t.id);
    }

    // Build CorrelationGroups
    const groups: CorrelationGroup[] = [];
    for (const [, threatIds] of groupsMap) {
      const groupRelationships = relationships.filter(
        (r) => threatIds.includes(r.fromThreatId) && threatIds.includes(r.toThreatId),
      );

      // Primary threat = highest severity, then highest confidence
      const groupThreats = threats.filter((t) => threatIds.includes(t.id));
      const primary = groupThreats.sort((a, b) => {
        const sevOrder = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
        const sevDiff = sevOrder[b.severity] - sevOrder[a.severity];
        if (sevDiff !== 0) return sevDiff;
        return b.confidence - a.confidence;
      })[0]!;

      groups.push({
        primaryThreatId: primary.id,
        threatIds,
        relationships: groupRelationships,
      });
    }

    return groups;
  }
}

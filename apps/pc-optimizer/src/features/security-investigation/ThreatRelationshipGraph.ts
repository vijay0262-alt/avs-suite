/**
 * ThreatRelationshipGraph — builds a visual graph of threat relationships.
 *
 * Produces nodes, edges, and clusters for visualization.
 * Supports threat timeline, relationship graph, evidence cards,
 * severity badges, and confidence indicators.
 */
import type { Threat, ThreatRelationshipGraph, GraphNode, GraphEdge, GraphCluster, ThreatRelationship } from './types';

export class ThreatRelationshipGraphBuilder {
  build(threats: Threat[], relationships: ThreatRelationship[], primaryThreatId: string): ThreatRelationshipGraph {
    const nodes: GraphNode[] = threats.map((t) => ({
      id: t.id,
      threatId: t.id,
      label: t.name,
      category: t.category,
      severity: t.severity,
      confidence: t.confidence,
      isPrimary: t.id === primaryThreatId,
    }));

    const edges: GraphEdge[] = relationships.map((rel) => ({
      from: rel.fromThreatId,
      to: rel.toThreatId,
      type: rel.type,
      strength: rel.strength,
      label: rel.description,
    }));

    const clusters = this.buildClusters(threats, relationships);

    return {
      nodes,
      edges,
      clusters,
      totalNodes: nodes.length,
      totalEdges: edges.length,
    };
  }

  private buildClusters(threats: Threat[], relationships: ThreatRelationship[]): GraphCluster[] {
    // Group by category for cluster visualization
    const byCategory = new Map<string, string[]>();

    for (const t of threats) {
      if (!byCategory.has(t.category)) byCategory.set(t.category, []);
      byCategory.get(t.category)!.push(t.id);
    }

    const clusters: GraphCluster[] = [];

    for (const [category, nodeIds] of byCategory) {
      if (nodeIds.length > 1) {
        clusters.push({
          id: `cluster-${category}`,
          nodeIds,
          label: this.getClusterLabel(category),
          description: `${nodeIds.length} threat(s) in the ${category.replace(/_/g, ' ')} category`,
        });
      }
    }

    // Also create a cluster for strongly connected threats
    const strongRels = relationships.filter((r) => r.strength >= 0.75);
    if (strongRels.length > 0) {
      const stronglyConnected = new Set<string>();
      for (const rel of strongRels) {
        stronglyConnected.add(rel.fromThreatId);
        stronglyConnected.add(rel.toThreatId);
      }
      if (stronglyConnected.size > 1) {
        clusters.push({
          id: 'cluster-strong-correlation',
          nodeIds: [...stronglyConnected],
          label: 'Strongly Correlated',
          description: `${stronglyConnected.size} threats with strong correlation (>=75% strength)`,
        });
      }
    }

    return clusters;
  }

  private getClusterLabel(category: string): string {
    const labels: Record<string, string> = {
      spyware: 'Spyware Group',
      adware: 'Adware Group',
      pup: 'PUP Group',
      browser_hijacker: 'Browser Hijacker Group',
      crypto_miner: 'Crypto Miner Group',
      malware: 'Malware Group',
      unsafe_script: 'Script Abuse Group',
      suspicious_scheduled_task: 'Scheduled Task Group',
      suspicious_service: 'Service Group',
      suspicious_startup_entry: 'Startup Entry Group',
      backdoor: 'Backdoor Group',
      keylogger: 'Keylogger Group',
      ransomware: 'Ransomware Group',
      trojans: 'Trojan Group',
      rootkit: 'Rootkit Group',
      bootkit: 'Bootkit Group',
      dropper: 'Dropper Group',
      downloader: 'Downloader Group',
      pua: 'PUA Group',
      unknown: 'Unknown Threat Group',
    };
    return labels[category] ?? `${category.replace(/_/g, ' ')} Group`;
  }
}

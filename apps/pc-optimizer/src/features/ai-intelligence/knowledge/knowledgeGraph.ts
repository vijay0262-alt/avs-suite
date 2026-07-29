/**
 * Knowledge Graph — builds a graph of relationships between modules.
 *
 * Connects facts across: storage, startup, browser, windows, duplicates,
 * history, health, performance, experience, quota, capabilities, and future modules.
 *
 * The graph must support future expansion without modification.
 */
import type {
  KnowledgeFact,
  KnowledgeRelationship,
  KnowledgeGraph as IKnowledgeGraph,
  GraphNode,
  GraphEdge,
} from './types';

export class KnowledgeGraphBuilder {
  private _maxNodes: number;
  private _maxEdges: number;

  constructor(maxNodes: number = 500, maxEdges: number = 1000) {
    this._maxNodes = maxNodes;
    this._maxEdges = maxEdges;
  }

  /**
   * Build a knowledge graph from facts and relationships.
   */
  build(
    facts: KnowledgeFact[],
    relationships: KnowledgeRelationship[],
  ): IKnowledgeGraph {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Create nodes from facts
    for (const fact of facts) {
      if (nodes.length >= this._maxNodes) break;
      nodes.push({
        id: fact.id,
        label: fact.name,
        category: fact.category,
        factId: fact.id,
        value: fact.value,
      });
    }

    // Create edges from relationships
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const rel of relationships) {
      if (edges.length >= this._maxEdges) break;
      // Only add edge if both nodes exist
      if (nodeIds.has(rel.sourceFactId) && nodeIds.has(rel.targetFactId)) {
        edges.push({
          id: rel.id,
          source: rel.sourceFactId,
          target: rel.targetFactId,
          type: rel.type,
          label: rel.description,
          confidence: rel.confidence,
        });
      }
    }

    return {
      nodes,
      edges,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    };
  }

  /**
   * Get nodes by category.
   */
  getNodesByCategory(graph: IKnowledgeGraph, category: string): GraphNode[] {
    return graph.nodes.filter((n) => n.category === category);
  }

  /**
   * Get edges connected to a node.
   */
  getEdgesForNode(graph: IKnowledgeGraph, nodeId: string): GraphEdge[] {
    return graph.edges.filter((e) => e.source === nodeId || e.target === nodeId);
  }

  /**
   * Get neighboring nodes.
   */
  getNeighbors(graph: IKnowledgeGraph, nodeId: string): GraphNode[] {
    const neighborIds = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.source === nodeId) neighborIds.add(edge.target);
      if (edge.target === nodeId) neighborIds.add(edge.source);
    }
    return graph.nodes.filter((n) => neighborIds.has(n.id));
  }

  /**
   * Calculate graph density (ratio of actual edges to possible edges).
   */
  getDensity(graph: IKnowledgeGraph): number {
    if (graph.nodeCount < 2) return 0;
    const maxPossible = (graph.nodeCount * (graph.nodeCount - 1)) / 2;
    return graph.edgeCount / maxPossible;
  }

  /**
   * Find connected components.
   */
  findComponents(graph: IKnowledgeGraph): string[][] {
    const visited = new Set<string>();
    const components: string[][] = [];

    for (const node of graph.nodes) {
      if (visited.has(node.id)) continue;
      const component: string[] = [];
      this._dfs(graph, node.id, visited, component);
      components.push(component);
    }

    return components;
  }

  /**
   * Update limits.
   */
  setLimits(maxNodes: number, maxEdges: number): void {
    this._maxNodes = maxNodes;
    this._maxEdges = maxEdges;
  }

  // ── Private ────────────────────────────────────────────────

  private _dfs(graph: IKnowledgeGraph, nodeId: string, visited: Set<string>, component: string[]): void {
    visited.add(nodeId);
    component.push(nodeId);

    const neighbors = this.getNeighbors(graph, nodeId);
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.id)) {
        this._dfs(graph, neighbor.id, visited, component);
      }
    }
  }
}

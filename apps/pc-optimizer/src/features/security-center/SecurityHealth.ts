/**
 * SecurityHealth — evaluates overall security health.
 *
 * Produces a SecurityHealthReport with issues and recommendations
 * based on the current SecuritySnapshot.
 */
import type {
  SecuritySnapshot,
  SecurityHealthReport,
  SecurityHealthIssue,
} from './types';

export class SecurityHealth {
  check(snapshot: SecuritySnapshot | null): SecurityHealthReport {
    if (!snapshot) {
      return {
        overallHealth: 'unknown',
        securityScore: 0,
        issues: [],
        recommendations: [],
        timestamp: Date.now(),
      };
    }

    const issues: SecurityHealthIssue[] = [];

    if (snapshot.securityScore < 50) {
      issues.push({
        component: 'security_score',
        severity: 'high',
        description: `Security score is low (${snapshot.securityScore}/100)`,
        recommendation: 'Run a full system scan and address detected threats.',
      });
    } else if (snapshot.securityScore < 70) {
      issues.push({
        component: 'security_score',
        severity: 'medium',
        description: `Security score is moderate (${snapshot.securityScore}/100)`,
        recommendation: 'Review detected threats and consider a full scan.',
      });
    }

    const activeThreats = snapshot.threats.filter((t) => t.status === 'active');
    if (activeThreats.length > 0) {
      const criticalCount = activeThreats.filter((t) => t.severity === 'critical').length;
      const highCount = activeThreats.filter((t) => t.severity === 'high').length;

      if (criticalCount > 0) {
        issues.push({
          component: 'active_threats',
          severity: 'critical',
          description: `${criticalCount} critical threat(s) active`,
          recommendation: 'Address critical threats immediately.',
        });
      }
      if (highCount > 0) {
        issues.push({
          component: 'active_threats',
          severity: 'high',
          description: `${highCount} high-severity threat(s) active`,
          recommendation: 'Review and address high-severity threats.',
        });
      }
    }

    const inactiveProviders = snapshot.providerStatuses.filter(
      (p) => p.status === 'error' || p.status === 'unsupported',
    );
    for (const provider of inactiveProviders) {
      issues.push({
        component: `provider:${provider.id}`,
        severity: 'medium',
        description: `Provider "${provider.name}" is ${provider.status}`,
        recommendation: 'Check provider configuration and restart if needed.',
      });
    }

    if (!snapshot.protectionStatus.overallProtected) {
      issues.push({
        component: 'protection',
        severity: 'high',
        description: 'System is not fully protected',
        recommendation: 'Enable all security providers.',
      });
    }

    const overallHealth = this.computeOverallHealth(issues, snapshot.securityScore);
    const recommendations = issues.map((i) => i.recommendation);

    return {
      overallHealth,
      securityScore: snapshot.securityScore,
      issues,
      recommendations,
      timestamp: Date.now(),
    };
  }

  private computeOverallHealth(issues: SecurityHealthIssue[], score: number): SecurityHealthReport['overallHealth'] {
    const hasCritical = issues.some((i) => i.severity === 'critical');
    const hasHigh = issues.some((i) => i.severity === 'high');
    if (hasCritical || score < 30) return 'critical';
    if (hasHigh || score < 60) return 'degraded';
    return 'healthy';
  }
}

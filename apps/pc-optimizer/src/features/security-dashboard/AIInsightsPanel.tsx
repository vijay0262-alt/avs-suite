/**
 * AIInsightsPanel — displays AI-generated security insights with
 * confidence scores, severity, and actionable recommendations.
 */
import { Card, Badge, ProgressBar } from '@avs/ui';
import type { BadgeTone } from '@avs/ui';
import {
  LightBulbIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';
import type { AIInsight } from './SecurityDashboardViewModel';

interface AIInsightsPanelProps {
  insights: AIInsight[];
}

function severityTone(severity: AIInsight['severity']): BadgeTone {
  switch (severity) {
    case 'critical': return 'danger';
    case 'high': return 'danger';
    case 'medium': return 'warning';
    case 'low': return 'brand';
    default: return 'neutral';
  }
}

function InsightIcon({ severity }: { severity: AIInsight['severity'] }) {
  if (severity === 'critical' || severity === 'high') {
    return <ExclamationTriangleIcon className="h-5 w-5 text-semantic-danger" aria-hidden />;
  }
  if (severity === 'medium') {
    return <ArrowTrendingUpIcon className="h-5 w-5 text-semantic-warning" aria-hidden />;
  }
  return <InformationCircleIcon className="h-5 w-5 text-text-muted" aria-hidden />;
}

export function AIInsightsPanel({ insights }: AIInsightsPanelProps) {
  if (insights.length === 0) return null;

  return (
    <Card
      title="AI Security Insights"
      actions={<Badge tone="brand">{insights.length} active</Badge>}
      data-testid="ai-insights-panel"
    >
      <div className="space-y-3">
        {insights.map((insight) => (
          <div
            key={insight.id}
            className="rounded-md border border-border p-3 hover:border-border-hover transition-colors"
            data-testid={`insight-${insight.id}`}
          >
            <div className="flex items-start gap-3">
              <InsightIcon severity={insight.severity} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-small font-medium text-text-primary">{insight.title}</span>
                  <Badge tone={severityTone(insight.severity)}>{insight.severity}</Badge>
                </div>
                <p className="mt-1 text-caption text-text-secondary">{insight.description}</p>

                {/* Confidence and source */}
                <div className="mt-2 flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <LightBulbIcon className="h-3 w-3 text-text-muted" aria-hidden />
                    <span className="text-micro text-text-muted">Confidence</span>
                    <div className="w-16">
                      <ProgressBar
                        value={insight.confidence * 100}
        tone={insight.confidence >= 0.8 ? 'success' : insight.confidence >= 0.6 ? 'warning' : 'danger'}
                      />
                    </div>
                    <span className="text-micro font-medium text-text-primary">
                      {(insight.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <span className="text-micro text-text-muted">Source: {insight.source}</span>
                </div>

                {/* Recommendation */}
                {insight.recommendation && (
                  <div className="mt-2 rounded-md bg-brand-primary/5 px-2 py-1.5">
                    <span className="text-micro font-medium text-brand-primary">AI Recommendation: </span>
                    <span className="text-caption text-text-secondary">{insight.recommendation}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

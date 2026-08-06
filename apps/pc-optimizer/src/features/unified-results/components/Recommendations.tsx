/**
 * Recommendations — list of AI recommendations with expandable details.
 *
 * Each recommendation shows:
 *   - Priority badge, title, summary
 *   - Expected benefit, estimated time
 *   - Risk level, rollback availability
 *   - AI confidence with evidence
 *   - Why it matters, what happens if ignored
 *   - Selection checkbox
 */
import { useState } from 'react';
import {
  ChevronRightIcon,
  SparklesIcon,
  ClockIcon,
  ShieldCheckIcon,
  ArrowUturnLeftIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import type { UnifiedRecommendation, IssuePriority } from '../unifiedResultsTypes';
import {
  priorityLabel,
  priorityColor,
  priorityBg,
  priorityOrder,
  riskColor,
} from '../unifiedResultsTypes';

export interface RecommendationsProps {
  recommendations: UnifiedRecommendation[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], selected: boolean) => void;
}

export function Recommendations({ recommendations, selectedIds, onToggle, onToggleAll }: RecommendationsProps) {
  if (recommendations.length === 0) return null;

  const sorted = [...recommendations].sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority));
  const allSelected = sorted.every((r) => selectedIds.has(r.id));
  const safeIds = sorted.filter((r) => r.riskLevel === 'none' || r.riskLevel === 'low').map((r) => r.id);

  return (
    <div className="space-y-3" data-testid="recommendations">
      {/* Select all bar */}
      <div className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-primary"
            checked={allSelected}
            onChange={(e) => onToggleAll(sorted.map((r) => r.id), e.target.checked)}
          />
          <span className="text-caption font-medium text-text-secondary">
            {selectedIds.size} of {sorted.length} selected
          </span>
        </label>
        {safeIds.length > 0 && (
          <button
            onClick={() => onToggleAll(safeIds, true)}
            className="text-caption font-medium text-brand-primary hover:underline"
          >
            Select All Safe ({safeIds.length})
          </button>
        )}
      </div>

      {/* Recommendation list */}
      {sorted.map((rec) => (
        <RecommendationRow
          key={rec.id}
          recommendation={rec}
          selected={selectedIds.has(rec.id)}
          onToggle={() => onToggle(rec.id)}
        />
      ))}
    </div>
  );
}

function RecommendationRow({
  recommendation: rec,
  selected,
  onToggle,
}: {
  recommendation: UnifiedRecommendation;
  selected: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-[var(--avs-radius-md)] border ${priorityBg(rec.priority)} transition-all ${
        selected ? 'ring-1 ring-brand-primary/30' : ''
      }`}
      data-testid={`recommendation-${rec.id}`}
    >
      {/* Header row */}
      <div className="flex items-start gap-2 p-3">
        {/* Checkbox */}
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-brand-primary shrink-0"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${rec.title}`}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <PriorityBadge priority={rec.priority} />
            <span className="text-small font-semibold text-text-primary">{rec.title}</span>
            {rec.requiresPro && (
              <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-micro font-medium text-brand-primary">
                Pro
              </span>
            )}
          </div>
          <p className="mt-1 text-caption text-text-secondary">{rec.summary}</p>

          {/* Quick stats */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-caption">
            <span className="flex items-center gap-1 text-text-muted">
              <SparklesIcon className="h-3 w-3" />
              <span>Benefit: <span className="font-medium text-text-secondary">{rec.expectedBenefit}</span></span>
            </span>
            <span className="flex items-center gap-1 text-text-muted">
              <ClockIcon className="h-3 w-3" />
              <span>Time: <span className="font-medium text-text-secondary">{rec.estimatedTime}</span></span>
            </span>
            <span className={`flex items-center gap-1 ${riskColor(rec.riskLevel)}`}>
              <ShieldCheckIcon className="h-3 w-3" />
              <span>Risk: <span className="font-medium capitalize">{rec.riskLevel}</span></span>
            </span>
            {rec.rollbackAvailable && (
              <span className="flex items-center gap-1 text-semantic-success">
                <ArrowUturnLeftIcon className="h-3 w-3" />
                <span>Rollback available</span>
              </span>
            )}
          </div>
        </div>

        {/* AI Confidence */}
        <div className="shrink-0 text-right">
          <div className="text-caption text-text-muted">AI Confidence</div>
          <div className="text-small font-bold tabular-nums text-brand-primary">
            {Math.round(rec.aiConfidence * 100)}%
          </div>
        </div>

        {/* Expand button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 rounded-[var(--avs-radius-sm)] p-1 text-text-muted hover:bg-[var(--avs-surface-muted)]"
          aria-expanded={expanded}
          aria-label="Toggle details"
        >
          <ChevronRightIcon className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-[var(--avs-border)] px-3 pb-3 pt-2 space-y-2">
          {/* Description */}
          <p className="text-caption text-text-secondary">{rec.description}</p>

          {/* Why it matters */}
          <div className="rounded-[var(--avs-radius-sm)] bg-[var(--avs-surface)] p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <InformationCircleIcon className="h-3.5 w-3.5 text-brand-primary" />
              <span className="text-caption font-semibold text-text-primary">Why This Matters</span>
            </div>
            <p className="text-caption text-text-secondary">{rec.whyItMatters}</p>
          </div>

          {/* What happens if ignored */}
          <div className="rounded-[var(--avs-radius-sm)] bg-[var(--avs-surface)] p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <ExclamationCircleIcon className="h-3.5 w-3.5 text-semantic-warning" />
              <span className="text-caption font-semibold text-text-primary">If Ignored</span>
            </div>
            <p className="text-caption text-text-secondary">{rec.whatHappensIfIgnored}</p>
          </div>

          {/* Evidence */}
          {rec.evidence.length > 0 && (
            <div className="rounded-[var(--avs-radius-sm)] bg-[var(--avs-surface)] p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckIcon className="h-3.5 w-3.5 text-semantic-success" />
                <span className="text-caption font-semibold text-text-primary">Evidence</span>
              </div>
              <ul className="space-y-0.5">
                {rec.evidence.map((ev, i) => (
                  <li key={i} className="text-caption text-text-muted flex items-start gap-1.5">
                    <span className="mt-1 h-1 w-1 rounded-full bg-text-muted shrink-0" />
                    <span>{ev}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: IssuePriority }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-micro font-bold uppercase tracking-wide ${priorityBg(priority)} ${priorityColor(priority)}`}
    >
      {priorityLabel(priority)}
    </span>
  );
}

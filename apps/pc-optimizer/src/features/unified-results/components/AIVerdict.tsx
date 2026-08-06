/**
 * AIVerdict — natural language summary of scan findings.
 *
 * Displays the AI's verdict with confidence, evidence count,
 * and supporting evidence sources.
 */
import { SparklesIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useAnimatedCounter } from '../../unified-scan/useAnimatedCounter';
import type { UnifiedAIVerdict } from '../unifiedResultsTypes';

export interface AIVerdictProps {
  verdict: UnifiedAIVerdict;
}

export function AIVerdict({ verdict }: AIVerdictProps) {
  const animatedConfidence = useAnimatedCounter(verdict.confidence * 100, 1000);
  const displayConfidence = Math.round(animatedConfidence);

  return (
    <div
      className="rounded-[var(--avs-radius-lg)] border border-brand-primary/20 bg-brand-primary/5 p-5 space-y-3"
      data-testid="ai-verdict"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <SparklesIcon className="h-5 w-5 text-brand-primary" aria-hidden />
        <h3 className="text-small font-semibold text-text-primary">Assessment</h3>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-caption text-text-muted">Confidence</span>
          <span className="text-small font-bold tabular-nums text-brand-primary" aria-live="polite">
            {displayConfidence}%
          </span>
        </div>
      </div>

      {/* Summary text */}
      <p className="text-small text-text-secondary leading-relaxed">{verdict.summary}</p>

      {/* Detail bullets */}
      {verdict.details.length > 0 && (
        <ul className="space-y-1.5">
          {verdict.details.map((detail, i) => (
            <li key={i} className="text-caption text-text-secondary flex items-start gap-2">
              <span className="mt-1 h-1 w-1 rounded-full bg-brand-primary shrink-0" />
              <span>{detail}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Evidence sources */}
      {verdict.evidenceSources.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-brand-primary/10">
          <ShieldCheckIcon className="h-3.5 w-3.5 text-text-muted" aria-hidden />
          <span className="text-caption text-text-muted">Evidence:</span>
          {verdict.evidenceSources.map((source, i) => (
            <span
              key={i}
              className="rounded-full bg-[var(--avs-surface-muted)] px-2 py-0.5 text-micro font-medium text-text-secondary"
            >
              {source}
            </span>
          ))}
          <span className="text-micro text-text-muted">· {verdict.evidenceCount} data points</span>
        </div>
      )}
    </div>
  );
}

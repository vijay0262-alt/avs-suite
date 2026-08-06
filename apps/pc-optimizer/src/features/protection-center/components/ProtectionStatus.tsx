import { InformationCircleIcon } from '@heroicons/react/24/outline';
import type { ProtectionState, CoverageItem } from '../protectionCenter.types';

export interface ProtectionStatusProps {
  state: ProtectionState;
  coverage: CoverageItem[];
}

export function ProtectionStatus({ state, coverage }: ProtectionStatusProps) {
  const uncovered = coverage.filter((c) => !c.covered);
  const covered = coverage.filter((c) => c.covered);

  let explanation: string;

  if (state.level === 'fully_protected') {
    explanation = `All ${covered.length} protection layers are active. Your PC is secured with real-time protection, firewall, Smart Screen, and up-to-date system patches. ${
      uncovered.length === 0 ? 'No action needed.' : ''
    }`;
  } else if (state.level === 'partially_protected') {
    explanation = `Your PC has ${covered.length} of ${coverage.length} protection layers active. ${
      uncovered.length > 0
        ? `The following need attention: ${uncovered.map((u) => u.label).join(', ')}.`
        : ''
    } Enable the missing layers for complete protection.`;
  } else if (state.level === 'at_risk') {
    explanation = `Your PC is at risk. Only ${covered.length} of ${coverage.length} protection layers are active. Critical security features are disabled. Please enable real-time protection and firewall immediately.`;
  } else {
    explanation = 'Protection status is being evaluated. Please wait while we gather system information.';
  }

  return (
    <div
      className="rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-gradient-surface p-4"
      role="region"
      aria-label="Protection status explanation"
    >
      <div className="flex items-start gap-3">
        <InformationCircleIcon className="h-5 w-5 shrink-0 text-[var(--avs-info)] mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-[var(--avs-text-primary)] mb-1">
            What does &ldquo;{state.headline}&rdquo; mean?
          </h3>
          <p className="text-sm text-[var(--avs-text-secondary)] leading-relaxed">
            {explanation}
          </p>
        </div>
      </div>
    </div>
  );
}

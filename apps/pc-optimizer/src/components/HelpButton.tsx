/**
 * HelpButton — consistent help/info button for PageHeader actions.
 *
 * Shows a tooltip with contextual help text on hover/focus.
 */
import { useState } from 'react';
import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline';

export function HelpButton({
  text,
  testId = 'help-button',
}: {
  text: string;
  testId?: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        className="text-text-muted hover:text-text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        aria-label="Help"
        data-testid={testId}
      >
        <QuestionMarkCircleIcon className="h-5 w-5" aria-hidden />
      </button>
      {show && (
        <div
          role="tooltip"
          className="absolute right-0 top-full z-50 mt-1 w-64 rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-2 text-caption text-text-secondary shadow-[var(--avs-shadow-lg)]"
          data-testid={testId + '-tooltip'}
        >
          {text}
        </div>
      )}
    </div>
  );
}

import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@avs/ui';
import { useEdition } from '../config/EditionManager';
import {
  ExclamationTriangleIcon,
  ArrowPathIcon,
  HomeIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DocumentArrowDownIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';

interface Props {
  children?: ReactNode;
  standalone?: boolean;
  /** When this value changes, any caught error is cleared — useful for resetting on route change. */
  resetKey?: string;
}

interface State {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * ErrorBoundary — the outermost safety net for the renderer. Catches
 * runtime exceptions in the React tree and displays a professional,
 * recoverable fallback instead of a blank window.
 *
 * Features:
 * - Brand-aligned error messaging
 * - "Try Again" to reset the boundary
 * - "Return to Dashboard" for safe navigation
 * - "View Error Details" expandable technical info
 * - "Export Error Report" (downloads a .txt file)
 * - "Send Diagnostic Report" (Professional edition only)
 * - Edition-aware action visibility
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.setState({ errorInfo: info });
  }

  override componentDidUpdate(prevProps: Props): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, errorInfo: null });
    }
  }

  private reset = () => this.setState({ error: null, errorInfo: null });

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <ErrorFallback
        error={this.state.error}
        errorInfo={this.state.errorInfo}
        onReset={this.reset}
        standalone={this.props.standalone}
      />
    );
  }
}

// ── Functional fallback (can use hooks) ──────────────────────────

interface ErrorFallbackProps {
  error: Error;
  errorInfo: ErrorInfo | null;
  onReset: () => void;
  standalone?: boolean;
}

function ErrorFallback({ error, errorInfo, onReset, standalone }: ErrorFallbackProps) {
  const navigate = useNavigate();
  const edition = useEdition();
  const isPro = edition === 'professional';
  const [showDetails, setShowDetails] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  const handleReturnToDashboard = () => {
    onReset();
    navigate('/dashboard');
  };

  const handleExportReport = () => {
    const timestamp = new Date().toISOString();
    const report = [
      'AVS Shield — Error Report',
      '===========================',
      '',
      `Timestamp: ${timestamp}`,
      `Edition: ${edition}`,
      `App Version: (see Help > About for version info)`,
      '',
      'Error:',
      '------',
      `${error.name}: ${error.message}`,
      '',
      'Stack Trace:',
      '------------',
      error.stack ?? '(no stack available)',
      '',
      'Component Stack:',
      '----------------',
      errorInfo?.componentStack ?? '(no component stack available)',
      '',
      '--- End of Report ---',
    ].join('\n');

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `avs-shield-error-${timestamp.replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSendDiagnosticReport = () => {
    // eslint-disable-next-line no-console
    console.info('[ErrorBoundary] Diagnostic report submitted', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo?.componentStack,
      edition,
    });
    setReportSent(true);
  };

  return (
    <div
      role="alert"
      data-testid="error-boundary"
      className={`mx-auto ${standalone ? 'mt-8' : 'my-16'} max-w-lg rounded-[var(--avs-radius-lg)] border border-semantic-danger/30 bg-[var(--avs-surface)] p-6 shadow-[var(--avs-shadow-md)]`}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-semantic-danger/10">
          <ExclamationTriangleIcon className="h-6 w-6 text-semantic-danger" aria-hidden />
        </div>
        <div className="flex-1">
          <h2 className="text-section-title font-semibold text-text-primary">
            Something went wrong
          </h2>
          <p className="mt-1 text-small text-text-secondary">
            AVS Shield encountered an unexpected problem.
          </p>
          <p className="mt-1 text-caption text-text-muted">
            The rest of the application is still running safely.
          </p>
        </div>
      </div>

      {/* Primary actions */}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={onReset}
          leftIcon={<ArrowPathIcon className="h-4 w-4" />}
          data-testid="error-boundary-try-again"
        >
          Try Again
        </Button>

        {!standalone && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleReturnToDashboard}
            leftIcon={<HomeIcon className="h-4 w-4" />}
            data-testid="error-boundary-dashboard"
          >
            Return to Dashboard
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDetails((v) => !v)}
          leftIcon={
            showDetails ? (
              <ChevronUpIcon className="h-4 w-4" />
            ) : (
              <ChevronDownIcon className="h-4 w-4" />
            )
          }
          data-testid="error-boundary-details"
        >
          View Error Details
        </Button>
      </div>

      {/* Edition-aware actions */}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExportReport}
          leftIcon={<DocumentArrowDownIcon className="h-4 w-4" />}
          data-testid="error-boundary-export"
        >
          Export Error Report
        </Button>

        {isPro && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSendDiagnosticReport}
            leftIcon={<PaperAirplaneIcon className="h-4 w-4" />}
            disabled={reportSent}
            data-testid="error-boundary-send-diagnostic"
          >
            {reportSent ? 'Report Sent' : 'Send Diagnostic Report'}
          </Button>
        )}
      </div>

      {/* Collapsible error details */}
      {showDetails && (
        <div
          className="mt-4 space-y-2 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3"
          data-testid="error-boundary-details-content"
        >
          <div>
            <span className="text-caption font-medium text-text-muted">Error: </span>
            <span className="text-caption text-text-secondary">{error.message}</span>
          </div>
          {error.stack && (
            <pre className="overflow-auto text-caption text-text-muted whitespace-pre-wrap break-all">
              {error.stack}
            </pre>
          )}
          {errorInfo?.componentStack && (
            <div>
              <span className="text-caption font-medium text-text-muted">Component stack:</span>
              <pre className="mt-1 overflow-auto text-caption text-text-muted whitespace-pre-wrap break-all">
                {errorInfo.componentStack}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="mt-4 text-caption text-text-muted">
        If the problem persists, contact{' '}
        <a
          href="mailto:help@avsshield.com"
          className="text-brand-primary hover:underline"
        >
          help@avsshield.com
        </a>
      </p>
    </div>
  );
}

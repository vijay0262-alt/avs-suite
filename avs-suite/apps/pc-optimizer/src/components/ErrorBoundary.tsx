import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  standalone?: boolean;
}

interface State {
  error: Error | null;
}

/**
 * ErrorBoundary — the outermost safety net for the renderer. Catches
 * runtime exceptions in the React tree and displays a recoverable
 * fallback instead of a blank window.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        data-testid="error-boundary"
        className="mx-auto my-16 max-w-lg rounded-lg border border-semantic-danger/40 bg-surface p-6 shadow-md"
      >
        <h2 className="text-lg font-semibold text-semantic-danger">Something went wrong.</h2>
        <p className="mt-2 text-sm text-text-secondary">
          The application encountered an unexpected error. You can try again below or restart the
          app if the problem persists.
        </p>
        <pre className="mt-3 overflow-auto rounded bg-surface-muted p-3 text-xs text-text-muted">
          {this.state.error.message}
        </pre>
        <button
          type="button"
          onClick={this.reset}
          className="mt-4 rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-secondary"
        >
          Try again
        </button>
      </div>
    );
  }
}

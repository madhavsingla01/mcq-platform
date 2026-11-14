/**
 * ErrorBoundary — catches React render errors
 * and displays a fallback UI instead of crashing the app.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback?: ReactNode;
  fullPage?: boolean;
  message?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: unknown;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    const message = this.state.error instanceof Error ? this.state.error.message : '';
    if (/Failed to fetch dynamically imported module|Loading chunk .* failed|Importing a module script failed/i.test(message)) {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '48px 24px', textAlign: 'center',
          minHeight: this.props.fullPage ? '60vh' : '200px',
        }}>
          <AlertCircle size={40} style={{ color: 'var(--color-text-muted)', marginBottom: 12 }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--color-text)' }}>
            Something went wrong
          </h3>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 16, maxWidth: 360 }}>
            {this.props.message || 'An unexpected error occurred. Try refreshing the page.'}
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              padding: '8px 20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--color-border)',
              background: 'var(--color-surface)', color: 'var(--color-text)', fontWeight: 600, fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

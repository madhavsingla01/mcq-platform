/**
 * ErrorBoundary — catches React render errors
 * and displays a fallback UI instead of crashing the app.
 */

import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
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
          <span className="material-symbols-outlined" style={{ fontSize: 40, color: '#a1a1aa', marginBottom: 12 }}>
            error_outline
          </span>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#18181b' }}>
            Something went wrong
          </h3>
          <p style={{ fontSize: 14, color: '#71717a', marginBottom: 16, maxWidth: 360 }}>
            {this.props.message || 'An unexpected error occurred. Try refreshing the page.'}
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              padding: '8px 20px', borderRadius: 8, border: '1px solid #e4e4e7',
              background: '#fff', color: '#18181b', fontWeight: 600, fontSize: 14,
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

import React, { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Spendwise ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    if (window.confirm('Reset local cache and reload? Your backed-up data will be restored.')) {
      try {
        window.localStorage.removeItem('spendwise.session')
      } catch {}
      window.location.href = '/'
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-screen">
          <div className="error-boundary-card">
            <div className="error-icon-wrap">
              <AlertTriangle size={32} />
            </div>
            <h2>Something went wrong</h2>
            <p>
              An unexpected error occurred while rendering the workspace. Your data in IndexedDB and Google Drive remains safe.
            </p>
            {this.state.error?.message && (
              <pre className="error-details">{this.state.error.message}</pre>
            )}
            <div className="error-actions">
              <button type="button" className="button button-primary" onClick={this.handleReload}>
                <RefreshCw size={15} /> Reload workspace
              </button>
              <button type="button" className="button button-secondary" onClick={this.handleReset}>
                <Trash2 size={15} /> Clear local cache
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

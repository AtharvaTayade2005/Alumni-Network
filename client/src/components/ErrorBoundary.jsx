import React from 'react'
import { Card, Button } from './ui.jsx'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    if (this.props.onReset) this.props.onReset()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset)
      }
      return (
        <div className="p-6 max-w-2xl mx-auto my-8">
          <Card className="p-6 border-red-500/50 space-y-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] tracking-widest text-red-500 uppercase font-bold">
                RUNTIME RENDERING ERROR DETECTED
              </span>
            </div>
            <h2 className="text-lg font-bold text-swiss-text">Something went wrong</h2>
            <p className="text-sm text-swiss-muted">
              An unexpected error occurred while rendering this section of the portal.
            </p>
            {this.state.error?.message ? (
              <pre className="p-3 bg-swiss-surface border border-swiss-border font-mono text-xs text-red-400 overflow-x-auto whitespace-pre-wrap rounded-xs">
                {this.state.error.message}
              </pre>
            ) : null}
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={this.handleReset} variant="secondary" size="sm">
                Try Again
              </Button>
              <Button onClick={() => window.location.reload()} size="sm">
                Reload Application
              </Button>
            </div>
          </Card>
        </div>
      )
    }
    return this.props.children
  }
}

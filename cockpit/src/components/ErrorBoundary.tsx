import { Component, type ReactNode, type ErrorInfo } from 'react'

// Safety net: catches any render error and shows the message instead of a
// silent blank page. Added after a deprecated dependency crashed the app.

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Cockpit crashed:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', background: '#0E1B2C', color: '#e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, fontFamily: 'system-ui, sans-serif',
        }}>
          <div style={{ maxWidth: 560 }}>
            <h1 style={{ color: '#F4C20D', fontSize: 20, marginBottom: 12 }}>
              Cockpit hit an error
            </h1>
            <pre style={{
              fontSize: 13, color: '#94a3b8', whiteSpace: 'pre-wrap',
              background: '#162438', padding: 16, borderRadius: 8,
            }}>
              {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
            </pre>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

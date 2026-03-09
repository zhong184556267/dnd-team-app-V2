import { Component } from 'react'

/** 捕获子组件错误，避免白屏并显示错误信息 */
export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary:', error, info?.componentStack)
  }

  render() {
    if (this.state.hasError && this.state.error) {
      const e = this.state.error
      const msg = e?.message ?? String(e)
      const stack = e?.stack ?? ''
      const extra = [e?.fileName, e?.cause].filter(Boolean).join('\n')
      return (
        <div style={{ minHeight: '100vh', background: '#121212', color: '#e2e8f0', padding: 24, fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
          <h1 style={{ color: '#f87171', marginBottom: 16, fontSize: '1.5rem' }}>页面出错</h1>
          <p style={{ color: '#94a3b8', marginBottom: 8 }}>请把下方错误信息截图或复制给开发者（并打开 F12 控制台查看是否有更多报错）：</p>
          <pre style={{ background: '#1E293B', color: '#e2e8f0', padding: 16, borderRadius: 8, overflow: 'auto', fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {msg}
            {stack ? `\n\n${stack}` : ''}
            {extra ? `\n\n${extra}` : ''}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 16, padding: '10px 20px', background: '#E01C2F', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer' }}
          >
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

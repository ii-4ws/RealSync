import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import Dashboard from './screens/Dashboard'
import Sessions from './screens/Sessions'
import Reports from './screens/Reports'
import Settings from './screens/Settings'
import Login from './screens/Login'
import SignUp from './screens/SignUp'
import CompleteProfile from './screens/CompleteProfile'
import FAQ from './screens/FAQ'
import { SessionProvider, useSessionContext } from './contexts/SessionContext'
import { WebSocketProvider } from './contexts/WebSocketContext'
import { NotificationProvider } from './contexts/NotificationContext'

const PROTOTYPE_MODE = import.meta.env.VITE_PROTOTYPE_MODE === '1';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { supabaseSession, loadingAuth, needsOnboarding } = useSessionContext()

  if (loadingAuth) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg0)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', fontSize: 14 }}>
        Loading...
      </div>
    )
  }

  // In prototype mode, skip auth check
  if (PROTOTYPE_MODE) return <>{children}</>

  if (!supabaseSession) {
    return <Navigate to="/login" replace />
  }

  if (needsOnboarding) {
    return <Navigate to="/complete-profile" replace />
  }

  return <>{children}</>
}

function AppWithSession() {
  const { activeSession } = useSessionContext()

  return (
    <WebSocketProvider sessionId={activeSession?.sessionId ?? null}>
      <NotificationProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/complete-profile" element={<CompleteProfile />} />
            <Route element={
              <AuthGuard>
                <AppLayout />
              </AuthGuard>
            }>
              <Route path="/" element={<Dashboard />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/faq" element={<FAQ />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </WebSocketProvider>
  )
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontFamily: 'Inter, sans-serif', gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#e2e8f0' }}>Something went wrong</div>
          <div style={{ fontSize: 13 }}>Please refresh the page to continue.</div>
          <button onClick={() => window.location.reload()} style={{ marginTop: 8, padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(34,211,238,0.3)', background: 'rgba(34,211,238,0.08)', color: '#22d3ee', fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Refresh</button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <SessionProvider>
        <AppWithSession />
      </SessionProvider>
    </ErrorBoundary>
  )
}

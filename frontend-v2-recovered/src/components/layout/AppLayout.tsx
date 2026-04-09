import React, { useState, useCallback, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import MobileSidebar from './MobileSidebar'
import CommandPalette from './CommandPalette'
import $ from '../../lib/tokens'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function AppLayout() {
  const [cmdOpen, setCmdOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const isMobile = useIsMobile()
  const closeMobile = useCallback(() => setMobileOpen(false), [])

  // Global Cmd+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div style={{ display: 'flex', height: '100vh', background: $.bg0, overflow: 'hidden' }}>
      {/* Ambient gradient orbs */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{
          position: 'absolute', width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)',
          top: -200, right: -100, filter: 'blur(80px)',
        }} />
        <div style={{
          position: 'absolute', width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)',
          bottom: -200, left: 100, filter: 'blur(80px)',
        }} />
        <div style={{
          position: 'absolute', width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,130,246,0.04) 0%, transparent 70%)',
          top: '40%', left: '50%', filter: 'blur(60px)',
        }} />
      </div>

      {/* Desktop sidebar */}
      {!isMobile && <Sidebar />}

      {/* Mobile drawer */}
      {isMobile && <MobileSidebar open={mobileOpen} onClose={closeMobile} />}

      {/* Main content area */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', position: 'relative', zIndex: 1, marginLeft: 0,
      }}>
        <Header onCmdK={() => setCmdOpen(true)} onHamburger={() => setMobileOpen(true)} />
        <div style={{
          flex: 1, overflow: 'auto',
          padding: isMobile ? '10px 10px 14px' : '12px 16px 16px',
        }}>
          <Outlet />
        </div>
      </div>

      {/* Command palette */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  )
}

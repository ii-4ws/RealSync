import React, { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LayoutDashboard, Clock, FileText, Settings, HelpCircle, X } from 'lucide-react'
import $ from '../../lib/tokens'

interface MobileSidebarProps {
  open: boolean
  onClose: () => void
}

const ALL_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Clock, label: 'Sessions', path: '/sessions' },
  { icon: FileText, label: 'Reports', path: '/reports' },
  { icon: Settings, label: 'Settings', path: '/settings' },
  { icon: HelpCircle, label: 'FAQ', path: '/faq' },
]

export default function MobileSidebar({ open, onClose }: MobileSidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()

  // Close on route change
  useEffect(() => { onClose() }, [location.pathname])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  function isActive(path: string) {
    return location.pathname === path || (path !== '/' && location.pathname.startsWith(path))
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0, zIndex: 300,
              background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
            }}
          />
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38, mass: 0.9 }}
            style={{
              position: 'fixed', top: 0, left: 0, bottom: 0, width: 260,
              zIndex: 301, background: $.bg1,
              borderRight: `1px solid ${$.b1}`,
              display: 'flex', flexDirection: 'column',
              boxShadow: '8px 0 40px rgba(0,0,0,0.45)',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '18px 16px 12px', borderBottom: `1px solid ${$.b1}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src={`${import.meta.env.BASE_URL}realsync-eye-only.png`} alt="RealSync" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: $.t1, letterSpacing: '-0.2px' }}>RealSync</span>
              </div>
              <button
                onClick={onClose}
                style={{
                  width: 30, height: 30, borderRadius: 8,
                  border: `1px solid ${$.b1}`, background: 'transparent',
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: $.t3,
                }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Nav items */}
            <div style={{ flex: 1, padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {ALL_NAV.map((item) => {
                const active = isActive(item.path)
                return (
                  <button
                    key={item.path}
                    onClick={() => { navigate(item.path); onClose() }}
                    style={{
                      width: '100%', height: 46, borderRadius: 10, border: 'none',
                      cursor: 'pointer',
                      background: active ? 'rgba(34,211,238,0.1)' : 'transparent',
                      color: active ? $.cyan : $.t2,
                      display: 'flex', alignItems: 'center', gap: 12,
                      paddingLeft: 12, paddingRight: 12,
                      fontFamily: 'Inter, sans-serif', fontSize: 14,
                      fontWeight: active ? 600 : 400,
                      position: 'relative', transition: 'background 150ms, color 150ms',
                    }}
                  >
                    {active && (
                      <div style={{
                        position: 'absolute', left: 0, top: 8, bottom: 8,
                        width: 3, borderRadius: 2, background: $.cyan,
                      }} />
                    )}
                    <item.icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Clock, FileText, Users, Settings, Shield } from 'lucide-react'
import $ from '../../lib/tokens'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

const COMMANDS = [
  { icon: Clock, label: 'New Session', hint: 'N', action: (nav: (p: string) => void) => nav('/sessions') },
  { icon: FileText, label: 'View Reports', hint: 'R', action: (nav: (p: string) => void) => nav('/reports') },
  { icon: Users, label: 'Manage Participants', hint: 'P', action: () => {} },
  { icon: Settings, label: 'Settings', hint: 'S', action: (nav: (p: string) => void) => nav('/settings') },
  { icon: Shield, label: 'Security Audit', hint: 'A', action: () => {} },
]

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      // Single-key shortcuts when palette is open
      const key = e.key.toUpperCase()
      const match = COMMANDS.find((c) => c.hint === key)
      if (match) {
        e.preventDefault()
        match.action(navigate)
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose, navigate])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            }}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35, mass: 0.8 }}
            style={{
              position: 'fixed', top: '20%', left: '50%',
              transform: 'translateX(-50%)',
              width: 'min(560px, 90vw)',
              zIndex: 101, background: $.bg1,
              border: `1px solid ${$.b2}`, borderRadius: 16,
              boxShadow: '0 16px 70px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.1)',
              overflow: 'hidden',
            }}
          >
            {/* Search input */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 18px', borderBottom: `1px solid ${$.b1}`,
            }}>
              <Search size={16} color={$.t3} />
              <input
                autoFocus
                placeholder="Search commands..."
                style={{
                  flex: 1, background: 'transparent', border: 'none',
                  color: $.t1, fontSize: 15, outline: 'none',
                  fontFamily: 'Inter, sans-serif',
                }}
              />
              <kbd style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 4,
                background: $.bg3, border: `1px solid ${$.b1}`,
                color: $.t3, fontFamily: 'JetBrains Mono, monospace',
              }}>
                ESC
              </kbd>
            </div>

            {/* Commands */}
            <div style={{ padding: '6px 0' }}>
              {COMMANDS.map((cmd) => (
                <button
                  key={cmd.label}
                  onClick={() => { cmd.action(navigate); onClose() }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 18px', background: 'transparent', border: 'none',
                    color: $.t2, cursor: 'pointer', fontSize: 14, textAlign: 'left',
                    transition: 'background 100ms',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <cmd.icon size={16} color={$.t3} />
                  <span style={{ flex: 1 }}>{cmd.label}</span>
                  <kbd style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 4,
                    background: $.bg3, border: `1px solid ${$.b1}`,
                    color: $.t4, fontFamily: 'JetBrains Mono, monospace',
                  }}>
                    {cmd.hint}
                  </kbd>
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
